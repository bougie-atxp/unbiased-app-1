import { useEffect, useState } from "react";
import { EyeOff, Plus } from "lucide-react";
import type { PalChoice, PalScale, PalsSettings } from "../../shared/pals";
import "./pals-gallery.css";

const thumbnailCache = new Map<string, Promise<string | null>>();

function thumbnailFor(id: string): Promise<string | null> {
  const existing = thumbnailCache.get(id);
  if (existing) return existing;
  const thumbnail = window.unbiased.palPreview(id).then((sprite) => {
    if (!sprite) return null;
    return new Promise<string | null>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const rows = image.naturalHeight / image.naturalWidth > 1.32 ? 11 : 9;
        const cellWidth = image.naturalWidth / 8;
        const cellHeight = image.naturalHeight / rows;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 160;
        const context = canvas.getContext("2d");
        if (!context) { resolve(null); return; }
        const scale = Math.min(150 / cellWidth, 150 / cellHeight);
        const width = cellWidth * scale;
        const height = cellHeight * scale;
        context.drawImage(image, 0, 0, cellWidth, cellHeight, (160 - width) / 2, (160 - height) / 2, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.onerror = () => resolve(null);
      image.src = sprite;
    });
  }).catch(() => null);
  thumbnailCache.set(id, thumbnail);
  return thumbnail;
}

function DefaultPalArt() {
  return (
    <div className="pal-art" aria-hidden="true">
      <div className="pal-art-ear pal-art-ear-left" />
      <div className="pal-art-ear pal-art-ear-right" />
      <div className="pal-art-body">
        <div className="pal-art-eye pal-art-eye-left" />
        <div className="pal-art-eye pal-art-eye-right" />
        <div className="pal-art-mouth" />
        <div className="pal-art-brand" />
      </div>
      <div className="pal-art-foot pal-art-foot-left" />
      <div className="pal-art-foot pal-art-foot-right" />
    </div>
  );
}

function PalArtwork({ id, large = false }: { id: string; large?: boolean }) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  useEffect(() => {
    setThumbnail(null);
    if (id === "default" || id === "none" || typeof window.unbiased.palPreview !== "function") return;
    let active = true;
    void thumbnailFor(id).then((value) => { if (active) setThumbnail(value); });
    return () => { active = false; };
  }, [id]);
  return (
    <div className={`pals-artwork${large ? " pals-artwork-large" : ""}`}>
      {id === "none" ? <EyeOff size={large ? 42 : 34} strokeWidth={1.4} aria-hidden="true" />
        : id === "default" ? <DefaultPalArt />
        : thumbnail ? <img src={thumbnail} alt="" />
        : <span className="pals-artwork-fallback" aria-hidden="true">?</span>}
    </div>
  );
}

export function PalsGallery({
  settings,
  busy,
  onSelect,
  onAdd,
  onVisibleChange,
  onScaleChange,
}: {
  settings: PalsSettings | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onVisibleChange: (visible: boolean) => void;
  onScaleChange: (scale: PalScale) => void;
}) {
  const choices: PalChoice[] = settings?.choices ?? [{ id: "default", name: "Original Pal" }];
  const selected = settings ? (settings.visible ? settings.selected : "none") : "default";
  const selectedChoice = choices.find((choice) => choice.id === settings?.selected);
  const name = selected === "none" ? "No Pal" : selectedChoice?.name ?? "Original Pal";
  return (
    <div className="pals-settings">
      <div className="pals-heading">
        <h1>Pals</h1>
        <button type="button" className="pals-secondary-button" disabled={!settings || busy} onClick={() => onVisibleChange(!settings?.visible)}>
          {settings?.visible ? "Hide Pal" : "Show Pal"}
        </button>
      </div>

      <div className="pals-feature" aria-label={`Current Pal: ${name}`}>
        <PalArtwork id={selected} large />
        <div className="pals-feature-footer">
          <span className="pals-feature-name">{name}</span>
          <label className="pals-size-control">
            <span>Size</span>
            <select value={settings?.scale ?? 1} disabled={!settings || busy} onChange={(event) => onScaleChange(Number(event.target.value) as PalScale)}>
              {[0.75, 1, 1.25, 1.5, 2].map((scale) => <option key={scale} value={scale}>{Math.round(scale * 100)}%</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="pals-collection-heading">
        <h2>My Pals</h2>
        <button type="button" className="pals-secondary-button" disabled={busy} onClick={onAdd}>
          <Plus size={16} aria-hidden="true" /> Add Pal
        </button>
      </div>
      <div className="pals-grid" role="radiogroup" aria-label="Choose a Pal">
        <label className="pals-card" data-selected={selected === "none"}>
          <input type="radio" name="pal-choice" value="none" checked={selected === "none"} disabled={!settings || busy} onChange={() => onVisibleChange(false)} />
          <PalArtwork id="none" />
          <span className="pals-card-name">None</span>
          <span className="pals-card-description">Keep the desktop clear</span>
        </label>
        {choices.map((choice) => (
          <label key={choice.id} className="pals-card" data-selected={selected === choice.id}>
            <input type="radio" name="pal-choice" value={choice.id} checked={selected === choice.id} disabled={!settings || busy} onChange={() => onSelect(choice.id)} />
            <PalArtwork id={choice.id} />
            <span className="pals-card-name">{choice.name}</span>
            <span className="pals-card-description">{choice.description ?? (choice.id === "default" ? "The original Unbiased Pal" : "Custom Pal")}</span>
          </label>
        ))}
      </div>
      <p className="pals-attribution">Discover more Pals at <a href="https://petdex.dev/" target="_blank" rel="noopener noreferrer">Petdex</a>.</p>
    </div>
  );
}
