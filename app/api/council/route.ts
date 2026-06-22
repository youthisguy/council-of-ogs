import { NextRequest, NextResponse } from "next/server";
import { getPersona } from "@/app/src/personas/personas";
import { runPersonaChat, type ChatMessage } from "@/app/src/lib/zgCompute";
import {
  appendCouncilTurn,
  readCouncilTranscript,
  writeCitation,
} from "@/app/src/lib/zgStorage";
 
type CouncilTurn = {
  personaId: string;
  personaName: string;
  content: string;
  ts: number;
  messageId: string;
};
 
export async function POST(req: NextRequest) {
  const {
    sessionId,
    personaIds,
    topic,
    rounds = 1,
    userInterjection,
  } = await req.json();
 
  if (!sessionId || !Array.isArray(personaIds) || personaIds.length < 2) {
    return NextResponse.json(
      { error: "sessionId and at least 2 personaIds are required" },
      { status: 400 }
    );
  }
 
  const personas = personaIds.map((id: string) => getPersona(id));
  if (personas.some((p: any) => !p)) {
    return NextResponse.json(
      { error: "One or more unknown personaIds" },
      { status: 404 }
    );
  }
 
  // Load existing transcript for this debate session (0G Storage)
  const priorTranscript: CouncilTurn[] = await readCouncilTranscript(sessionId);
 
  const newTurns: CouncilTurn[] = [];
 
  // If the user is jumping in, log it as a pseudo-turn so every persona sees it
  if (userInterjection) {
    const interjectionTurn: CouncilTurn = {
      personaId: "user",
      personaName: "You",
      content: userInterjection,
      ts: Date.now(),
      messageId: `user-${Date.now()}`,
    };
    newTurns.push(interjectionTurn);
  }
 
  for (let round = 0; round < rounds; round++) {
    for (const persona of personas) {
      const transcriptSoFar = [...priorTranscript, ...newTurns];
 
      const transcriptText = transcriptSoFar
        .map((t) => `${t.personaName}: ${t.content}`)
        .join("\n\n");
 
      const contextPrompt = `You are participating in a roundtable debate with other historical figures.
Topic: "${topic}"
 
Transcript so far:
${transcriptText || "(debate has not started yet)"}
 
Give YOUR OWN direct answer to the topic above, drawing on your own documented views — do not merely react to the fact that others have spoken, and do not ask another speaker a question instead of answering yourself. If something already said connects to your own actual views, name it specifically and say why you agree or disagree — but you must still answer the topic itself. Do not deflect by saying the topic is outside your area unless it genuinely has no connection to anything you are documented to have thought about. Keep your response focused — 2-4 sentences plus any necessary citation brackets. Do not narrate stage directions or describe your own tone; just speak.`;
 
      const messages: ChatMessage[] = [
        { role: "system", content: persona!.systemPrompt },
        { role: "user", content: contextPrompt },
      ];
 
      const { text } = await runPersonaChat(messages);
 
      const ts = Date.now();
      const messageId = `${persona!.id}-${ts}`;
 
      const turn: CouncilTurn = {
        personaId: persona!.id,
        personaName: persona!.name,
        content: text,
        ts,
        messageId,
      };
 
      newTurns.push(turn);
 
      // Persist this turn to the shared debate transcript (0G Storage)
      await appendCouncilTurn(sessionId, turn);
 
      // Persist the citation bundle backing this specific turn
      await writeCitation(sessionId, persona!.id, messageId, persona!.sources);
    }
  }
 
  return NextResponse.json({
    sessionId,
    transcript: [...priorTranscript, ...newTurns],
    newTurns,
  });
}
 
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  const transcript = await readCouncilTranscript(sessionId);
  return NextResponse.json({ sessionId, transcript });
}
 
