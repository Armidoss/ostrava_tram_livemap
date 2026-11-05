export function createMarkerElement(line: string | null, typeClass: string, selected: boolean, rotation: number): HTMLDivElement {
    const labelText = (line ?? "?").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 16);
    const element = document.createElement("div");
    element.className = `vehicle-marker ${typeClass} ${selected ? "vehicle-marker--selected" : ""}`;
    const direction = document.createElement("i");
    direction.className = "vehicle-marker__direction";
    direction.style.transform = `translate(-50%, -50%) rotate(${Number.isFinite(rotation) ? rotation : 0}deg)`;
    const label = document.createElement("span");
    label.textContent = labelText;
    element.append(direction, label);

    return element;
}
