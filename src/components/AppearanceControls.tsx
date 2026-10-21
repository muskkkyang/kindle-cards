import { useEffect, useRef, useState } from "react";
import type { CardAppearance } from "../types";
import { uploadMedia } from "../lib/studio";

export function AppearanceControls({
  value,
  onChange,
}: {
  value: CardAppearance;
  onChange: (value: CardAppearance) => void;
}) {
  const changeRef = useRef(onChange);
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="appearanceControls">
      <summary>字体、布局与背景</summary>
      <div className="appearanceGrid">
        <label>
          字体
          <select
            value={value.font || "sans"}
            onChange={(e) =>
              onChange({
                font: e.target.value as CardAppearance["font"],
              })
            }
          >
            <option value="sans">现代黑体</option>
            <option value="serif">阅读宋体</option>
            <option value="mono">等宽笔记</option>
          </select>
        </label>
        <label>
          文字大小
          <select
            value={value.fontScale || 1}
            onChange={(e) =>
              onChange({ ...value, fontScale: Number(e.target.value) })
            }
          >
            <option value={0.8}>小</option>
            <option value={1}>标准</option>
            <option value={1.2}>大</option>
            <option value={1.4}>特大</option>
          </select>
        </label>
        <label>
          留白
          <select
            value={value.spacing || "balanced"}
            onChange={(e) =>
              onChange({
                spacing: e.target.value as CardAppearance["spacing"],
              })
            }
          >
            <option value="compact">紧凑</option>
            <option value="balanced">均衡</option>
            <option value="airy">舒展</option>
          </select>
        </label>
        <label>
          对齐
          <select
            value={value.align || "left"}
            onChange={(e) =>
              onChange({
                align: e.target.value as CardAppearance["align"],
              })
            }
          >
            <option value="left">左对齐</option>
            <option value="center">居中</option>
          </select>
        </label>
        <label className="backgroundUpload">
          {busy ? "正在导入背景…" : "导入背景图片"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              setMessage("");
              try {
                const url = await uploadMedia(file);
                changeRef.current({ background: url });
              } catch (error) {
                setMessage(
                  error instanceof Error ? error.message : "导入失败，请重试。",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {value.background && (
          <button
            type="button"
            className="quietButton"
            onClick={() => onChange({ background: "" })}
          >
            使用纯色背景
          </button>
        )}
      </div>
      {message && <p role="alert">{message}</p>}
    </details>
  );
}
