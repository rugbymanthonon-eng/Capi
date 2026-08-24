(() => {
  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  const monthLabel = /^(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)\.?\s+\d{2}$/i;

  CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
    if (this?.canvas?.id === "custom-chart" && typeof text === "string" && monthLabel.test(text.trim())) {
      text = text.trim().replace(/\s+\d{2}$/, "").replace(/\.$/, "");
    }
    return originalFillText.call(this, text, ...args);
  };
})();
