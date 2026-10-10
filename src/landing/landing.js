/* Landing page behaviour. The page is static (hero, how it works, FAQ), so the
   only job here is keeping one FAQ answer open at a time. */
let built = false;

export function show() {
  if (built) return;
  built = true;
  const items = [...document.querySelectorAll("#faq details")];
  items.forEach((d) => d.addEventListener("toggle", () => {
    if (d.open) items.forEach((o) => { if (o !== d) o.open = false; });
  }));
}

export function hide() {}
