export default function ProgressBar({ val, color, height = 6 }) {
  return (
    <div style={{ height, background: "var(--color-background-secondary)", borderRadius: 99, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${val}%`,
          background: color || "var(--gold)",
          borderRadius: 99,
          transition: "width 0.4s",
        }}
      />
    </div>
  );
}
