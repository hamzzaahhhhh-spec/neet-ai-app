import { redirect } from "next/navigation";

export default function QuizRoot() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const date = `${parts.year}-${parts.month}-${parts.day}`;
  redirect(`/quiz/${date}`);
}