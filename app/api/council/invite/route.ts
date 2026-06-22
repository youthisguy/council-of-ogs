import { NextRequest, NextResponse } from "next/server";
import { getPersona } from "@/app/src/personas/personas";
import { runPersonaChat, type ChatMessage } from "@/app/src/lib/zgCompute";
import {
  seedCouncilFromMemory,
  appendCouncilTurn,
  readCouncilTranscript,
  writeCitation,
  type CouncilTurn,
} from "@/app/src/lib/zgStorage";
export async function POST(req: NextRequest) {
  const { userId, sessionId, hostPersonaId, inviteePersonaId } =
    await req.json();

  if (!userId || !sessionId || !hostPersonaId || !inviteePersonaId) {
    return NextResponse.json(
      {
        error:
          "userId, sessionId, hostPersonaId, and inviteePersonaId are required",
      },
      { status: 400 }
    );
  }

  const host = getPersona(hostPersonaId);
  const invitee = getPersona(inviteePersonaId);
  if (!host || !invitee) {
    return NextResponse.json({ error: "Unknown persona" }, { status: 404 });
  }
  if (host.id === invitee.id) {
    return NextResponse.json(
      { error: "Cannot invite the same persona that's already hosting" },
      { status: 400 }
    );
  }

  const transcript = await seedCouncilFromMemory(
    sessionId,
    userId,
    host.id,
    host.name
  );

  const transcriptText = transcript
    .map((t) => `${t.personaName}: ${t.content}`)
    .join("\n\n");

  const originalQuestion =
    transcript.filter((t) => t.personaId === "user").slice(-1)[0]?.content ??
    "the topic of this conversation";

  const introPrompt = `Someone in this conversation asked the following question, word for word:
 
"${originalQuestion}"
 
Your task is to answer that exact question above — not to describe or summarize the conversation, not to say what "the topic" is, and not to talk about your own famous works in the abstract. Answer as if the question were asked directly to you, right now.
 
For context, here is what others have said in response to that same question so far:
 
${transcriptText || "(no one has answered yet — you are the first to respond)"}
 
Now answer the question — "${originalQuestion}" — directly and specifically, drawing on your own documented views. If something already said connects to your own views, name it and say whether you agree or disagree and why — but the bulk of your answer must be your own direct position on the question itself. Do not open by describing what the conversation or topic "appears to be about." Do not deflect by saying this is outside your expertise unless the question truly has no connection to anything you are documented to have thought about. Keep your response to 2-4 sentences, plus any necessary citation brackets. Do not narrate that you "just joined" — simply answer.`;

  const messages: ChatMessage[] = [
    { role: "system", content: invitee.systemPrompt },
    { role: "user", content: introPrompt },
  ];

  const { text } = await runPersonaChat(messages);

  const ts = Date.now();
  const messageId = `${invitee.id}-${ts}`;
  const newTurn: CouncilTurn = {
    personaId: invitee.id,
    personaName: invitee.name,
    content: text,
    ts,
    messageId,
  };

  await appendCouncilTurn(sessionId, newTurn);
  await writeCitation(sessionId, invitee.id, messageId, invitee.sources);

  return NextResponse.json({
    sessionId,
    transcript: [...transcript, newTurn],
    newTurn,
    participants: [host.id, invitee.id],
  });
}
