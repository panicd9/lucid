// Load brand fonts at startup so they're embedded in renders.
// Names mirror dashboard/index.html — Orbitron + Exo 2 + JetBrains Mono.
import { loadFont as loadOrbitron } from "@remotion/google-fonts/Orbitron";
import { loadFont as loadExo2 } from "@remotion/google-fonts/Exo2";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

loadOrbitron("normal", { weights: ["400", "500", "600", "700"] });
loadExo2("normal", { weights: ["300", "400", "500", "600", "700"] });
loadJetBrains("normal", { weights: ["400", "500"] });
