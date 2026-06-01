import { useEffect, useState } from "react";
import ClassicApp from "../App";
import ProductShelfApp from "./ProductShelfApp";

function shouldOpenClassic(hash: string) {
  return hash.startsWith("#/classic") || hash.startsWith("#/play/");
}

export default function AppRoot() {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (shouldOpenClassic(hash)) {
    return <ClassicApp />;
  }

  return <ProductShelfApp />;
}
