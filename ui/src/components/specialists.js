import { Bug, ShieldCheck, TestTubeDiagonal } from "lucide-react";

export const specialists = [
  {
    id: "bugs",
    name: "Code quality",
    role: "Bugs & anti-patterns",
    icon: Bug,
    color: "violet",
  },
  {
    id: "security",
    name: "Security",
    role: "Vulnerabilities & risks",
    icon: ShieldCheck,
    color: "blue",
  },
  {
    id: "tests",
    name: "Test coverage",
    role: "Gaps & missing tests",
    icon: TestTubeDiagonal,
    color: "amber",
  },
];
