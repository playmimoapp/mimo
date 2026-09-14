import { OpenInNimiqPay } from './open-in-nimiq-pay';

export default async function OpenRoomInNimiqPay({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <OpenInNimiqPay code={code.toUpperCase().slice(0, 8)} />;
}
