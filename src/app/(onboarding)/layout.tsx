import { Cairo } from "next/font/google";

const cairo = Cairo({ subsets: ["arabic", "latin"] });

export default function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className={cairo.className}>{children}</div>;
}
