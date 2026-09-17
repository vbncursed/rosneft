export default function Lighting() {
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight intensity={1.1} position={[4, 6, 8]} />
      <directionalLight intensity={0.4} position={[-4, -3, -4]} />
    </>
  );
}
