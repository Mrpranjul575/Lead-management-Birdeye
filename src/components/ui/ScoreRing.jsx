export default function ScoreRing({ score, size = 34 }) {
  const color = score >= 80 ? '#10B981' : score >= 65 ? '#F59E0B' : '#EF4444';
  const r = (size / 2) - 4;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ position:'absolute', inset:0 }}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--b1)" strokeWidth="2.5"/>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={`${(score/100)*circ} ${circ}`}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`}/>
      </svg>
      <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
        justifyContent:'center', fontSize: size > 40 ? 13 : 10, fontWeight:700, color }}>
        {score}
      </span>
    </div>
  );
}
