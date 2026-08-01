import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names, letting a caller's utility win over a
 *  component default rather than both landing in the class list. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
