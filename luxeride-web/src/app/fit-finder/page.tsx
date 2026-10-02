import FitFinder from "@/components/FitFinder";

export default async function FitFinderPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const { product } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <FitFinder lockedProductSlug={product} />
    </div>
  );
}
