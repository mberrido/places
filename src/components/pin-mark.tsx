/** App icon artwork (rendered to PNG by next/og): a white map pin on terracotta. */
export function PinMark({ size }: { size: number }) {
  const pin = size * 0.5;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#c2410c",
      }}
    >
      <svg width={pin} height={pin} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"
          fill="#fff"
        />
        <circle cx="12" cy="10" r="2.6" fill="#c2410c" />
      </svg>
    </div>
  );
}
