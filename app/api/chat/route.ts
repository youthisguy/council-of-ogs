 import { NextRequest, NextResponse } from "next/server";
import { getPersona } from "@/app/src/personas/personas"; 
import { runPersonaChat, type ChatMessage } from "@/app/src/lib/zgCompute";
import {
  appendMemory,
  readMemory,
  writeCitation,
  readCouncilTranscript,
  appendCouncilTurn,
} from "@/app/src/lib/zgStorage";

export async function POST(req: NextRequest) {
  const { userId, personaId, message, sessionId } = await req.json();

  if (!userId || !personaId || !message) {
    return NextResponse.json(
      { error: "userId, personaId, and message are required" },
      { status: 400 }
    );
  }

  const persona = getPersona(personaId);
  if (!persona) {
    return NextResponse.json({ error: "Unknown persona" }, { status: 404 });
  }

  // Has this session already become a council session (second persona invited)?
  const existingCouncil = sessionId
    ? await readCouncilTranscript(sessionId)
    : [];
  const isCouncilSession = existingCouncil.length > 0;

  let messages: ChatMessage[];
  if (isCouncilSession) {
    // Route through the shared transcript so every participant sees the
    // same conversation, regardless of which persona answers next.
    const transcriptText = existingCouncil
      .map((t) => `${t.personaName}: ${t.content}`)
      .join("\n\n");
    messages = [
      { role: "system", content: persona.systemPrompt },
      {
        role: "user",
        content: `Conversation so far:\n\n${transcriptText}\n\nYou: ${message}`,
      },
    ];
  } else {
    // Normal 1:1 flow
    const history = await readMemory(userId, personaId);
    messages = [
      { role: "system", content: persona.systemPrompt },
      ...history.map((h) => ({ role: h.role, content: h.content } as ChatMessage)),
      { role: "user", content: message },
    ];
  }

  // Run inference via 0G Compute Router
  const { text } = await runPersonaChat(messages);

  const now = Date.now();
  const messageId = `${now}`;

  if (isCouncilSession && sessionId) {
    // Persist both turns into the shared council transcript
    await appendCouncilTurn(sessionId, {
      personaId: "user",
      personaName: "You",
      content: message,
      ts: now,
      messageId: `user-${now}`,
    });
    await appendCouncilTurn(sessionId, {
      personaId: persona.id,
      personaName: persona.name,
      content: text,
      ts: now + 1,
      messageId,
    });
    await writeCitation(sessionId, persona.id, messageId, persona.sources);
  } else {
    // Persist to isolated 1:1 memory as before
    await appendMemory(userId, personaId, { role: "user", content: message, ts: now });
    await appendMemory(userId, personaId, { role: "assistant", content: text, ts: now + 1 });
    await writeCitation(userId, personaId, messageId, persona.sources);
  }

  return NextResponse.json({
    reply: text,
    messageId,
    sources: persona.sources,
    persona: { id: persona.id, name: persona.name },
    isCouncilSession,
  });
}