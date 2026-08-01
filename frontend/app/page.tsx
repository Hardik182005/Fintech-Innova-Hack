import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Products } from "@/components/products";
import { GoverningRule } from "@/components/governing-rule";
import { Developers } from "@/components/developers";
import { Stats } from "@/components/stats";
import { Safety } from "@/components/safety";
import { Deployment } from "@/components/deployment";
import { SandboxNotice } from "@/components/sandbox-notice";
import { CTA } from "@/components/cta";
import { Footer } from "@/components/footer";

/**
 * The public page, in the order the argument has to be made: what the problem
 * is, the five primitives that answer it, the rule that governs all of them,
 * the API, what is true of the build, how it fails safe, what it runs on, and
 * then plainly what this is not.
 */
export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Products />
        <GoverningRule />
        <Developers />
        <Stats />
        <Safety />
        <Deployment />
        <SandboxNotice />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
