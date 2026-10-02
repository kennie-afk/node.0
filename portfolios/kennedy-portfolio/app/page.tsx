import MotionProvider from "./components/MotionProvider";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Capabilities from "./components/Capabilities";
import Projects from "./components/Projects";
import Experience from "./components/Experience";
import Skills from "./components/Skills";
import Contact from "./components/Contact";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <MotionProvider>
      <main className="layer">
        <Navbar />
        <Hero />
        <Capabilities />
        <Projects />
        <Experience />
        <Skills />
        <Contact />
        <Footer />
      </main>
    </MotionProvider>
  );
}
