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

  // 1. Seed the shared transcript from the 1:1 history (idempotent)
  const transcript = await seedCouncilFromMemory(
    sessionId,
    userId,
    host.id,
    host.name
  );

  // 2. Build context for the invitee: they see the real conversation so far
  const transcriptText = transcript
    .map((t) => `${t.personaName}: ${t.content}`)
    .join("\n\n");

  const introPrompt = `You are being invited into an ongoing conversation between a user and ${host.name}. Here is the conversation so far:

${transcriptText || "(no prior conversation — you are opening the discussion)"}

You have just joined. Respond as yourself, reacting naturally to what has been said — agree, disagree, add nuance, or pose a question, as your own documented views would actually lead you to. Keep your response focused: 2-4 sentences, plus any necessary citation brackets. Do not narrate that you "just joined" — simply speak.`;

  const messages: ChatMessage[] = [
    { role: "system", content: invitee.systemPrompt },
    { role: "user", content: introPrompt },
  ];

  // 3. Run inference for the invitee's entrance line
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

  // 4. Persist the invitee's entrance turn + citation bundle
  await appendCouncilTurn(sessionId, newTurn);
  await writeCitation(sessionId, invitee.id, messageId, invitee.sources);

  return NextResponse.json({
    sessionId,
    transcript: [...transcript, newTurn],
    newTurn,
    participants: [host.id, invitee.id],
  });
}