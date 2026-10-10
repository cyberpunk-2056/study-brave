const QUOTES = [
  "Small steps every day add up to big results.",
  "Discipline is choosing what you want most over what you want now.",
  "You don’t have to be perfect — just consistent.",
  "Study now, thank yourself later.",
  "Focus on progress, not perfection.",
  "One more chapter. One more problem. One more day.",
  "The expert in anything was once a beginner.",
  "Your future self is watching what you do today.",
  "Done is better than perfect. Start the timer.",
  "Hard work beats talent when talent doesn’t work hard.",
];

/** Same quote all day, different tomorrow. */
export function quoteOfTheDay(date = new Date()) {
  const day = Math.floor(date.getTime() / 86400_000);
  return QUOTES[day % QUOTES.length];
}
