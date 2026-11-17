export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo" aria-label="myartist.in">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/myartist-mark.png" alt="" width={size} height={size} />
      <span className="brand-name" aria-hidden="true">
        <span className="brand-name__my">my</span>
        <span className="brand-name__artist">artist</span>
        <span className="brand-name__domain">.in</span>
      </span>
    </span>
  );
}
