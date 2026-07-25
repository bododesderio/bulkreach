"use client"

export default function BroadcastAnimation() {
  const delays = [0, 0.7, 1.4, 2.1]
  return (
    <svg viewBox="0 0 320 320" width={340} height={340} aria-hidden="true">
      {delays.map((d, i) => (
        <circle key={i} cx={160} cy={160} r={50} fill="none" stroke="#00D4AA" strokeWidth={1.5}>
          <animate attributeName="r" values="52;148" dur="2.8s" repeatCount="indefinite" begin={`${d}s`} />
          <animate attributeName="opacity" values="0.8;0" dur="2.8s" repeatCount="indefinite" begin={`${d}s`} />
        </circle>
      ))}
      <circle cx={160} cy={86} r={5} fill="#00D4AA" opacity={0.85} />
      <circle cx={220} cy={114} r={4} fill="#00D4AA" opacity={0.70} />
      <circle cx={236} cy={183} r={5} fill="#00D4AA" opacity={0.80} />
      <circle cx={188} cy={237} r={4} fill="#00D4AA" opacity={0.68} />
      <circle cx={120} cy={232} r={5} fill="#00D4AA" opacity={0.85} />
      <circle cx={86} cy={178} r={4} fill="#00D4AA" opacity={0.72} />
      <circle cx={95} cy={118} r={5} fill="#00D4AA" opacity={0.78} />
      <circle cx={160} cy={50} r={3} fill="#00D4AA" opacity={0.38} />
      <circle cx={248} cy={90} r={3} fill="#00D4AA" opacity={0.33} />
      <circle cx={270} cy={200} r={3} fill="#00D4AA" opacity={0.38} />
      <circle cx={200} cy={272} r={3} fill="#00D4AA" opacity={0.33} />
      <circle cx={108} cy={268} r={3} fill="#00D4AA" opacity={0.38} />
      <circle cx={52} cy={208} r={3} fill="#00D4AA" opacity={0.33} />
      <circle cx={58} cy={100} r={3} fill="#00D4AA" opacity={0.38} />
      <rect x={136} y={138} width={48} height={42} rx={8} fill="#1B1F4A" />
      <rect x={142} y={144} width={36} height={28} rx={5} fill="#0D0F2E" stroke="#00D4AA" strokeWidth={1.2} />
      <path d="M142 151l18 8 18-8" stroke="#00D4AA" strokeWidth={1.2} fill="none" />
      <text
        x={160}
        y={310}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize={9.5}
        fill="rgba(0,212,170,0.48)"
        fontWeight={500}
      >
        20,000 recipients per batch
      </text>
    </svg>
  )
}
