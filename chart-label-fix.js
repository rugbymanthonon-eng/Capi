(() => {
  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  const monthAtStart = /^(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)\.?/i;

  CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
    if (this?.canvas?.id === "custom-chart" && typeof text === "string") {
      const match = text.trim().match(monthAtStart);
      if (match) text = match[1].toLowerCase();
    }
    return originalFillText.call(this, text, ...args);
  };

  const forceCustomChartRedraw = () => {
    const input = document.querySelector("#cycle-count");
    if (input) input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(forceCustomChartRedraw, 80);
      setTimeout(forceCustomChartRedraw, 350);
    }, { once: true });
  } else {
    setTimeout(forceCustomChartRedraw, 80);
    setTimeout(forceCustomChartRedraw, 350);
  }
})();