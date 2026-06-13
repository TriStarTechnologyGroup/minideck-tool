// Build a Gmail compose URL (opens a new message prefilled with to/cc/subject/body).
export function gmailComposeUrl(to: string[], cc: string[], subject: string, body: string): string {
  const parts = ["view=cm", "fs=1", `to=${encodeURIComponent(to.join(","))}`];
  if (cc.length) parts.push(`cc=${encodeURIComponent(cc.join(","))}`);
  parts.push(`su=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`);
  return `https://mail.google.com/mail/?${parts.join("&")}`;
}
