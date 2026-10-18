export const MAX_REPLIES = 3;
const MAX_REPLY_LENGTH = 80;

const COMPLETE_TAIL = /\n?[ \t]*\[\[\s*replies\s*:([^\]\n]*)\]\][ \t]*$/i;
const PARTIAL_TAIL = /\n?[ \t]*\[(\[[^\]\n]*)?$/;

export const REPLIES_RULE =
  'When your answer is final and the user is likely to continue, end it with one last line in exactly this form: [[replies: first | second | third]] — two or three short next requests written from the user\'s side, in the user\'s language, each under 60 characters, for example "Turn that mod off" or "Show the crash log". Leave the line out when you are asking a question, when the run failed, or when nothing sensible follows.';

export function splitReplies(
  text: string,
  streaming = false,
): { text: string; replies: string[] } {
  const match = text.match(COMPLETE_TAIL);

  if (match) {
    const replies = match[1]
      .split("|")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "" && entry.length <= MAX_REPLY_LENGTH)
      .slice(0, MAX_REPLIES);

    return { text: text.slice(0, match.index).trimEnd(), replies };
  }

  if (streaming) {
    return { text: text.replace(PARTIAL_TAIL, "").trimEnd(), replies: [] };
  }

  return { text, replies: [] };
}
