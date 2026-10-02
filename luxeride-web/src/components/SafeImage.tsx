"use client";

import Image, { ImageProps } from "next/image";
import { useState } from "react";

/**
 * Some product photos (Seat Covers, Cargo Liner, Mud Flaps, Sun Shade)
 * intentionally don't exist yet — this quietly hides the slot instead of
 * showing a broken-image icon, same behavior as the prototype's onerror handling.
 */
export default function SafeImage({ alt, ...props }: ImageProps) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return <Image alt={alt} {...props} onError={() => setHidden(true)} />;
}
