"use client";

import dynamic from "next/dynamic";

const CesiumExperience = dynamic(() => import("@/components/CesiumExperience"), {
  ssr: false,
});

export default function Home() {
  return <CesiumExperience />;
}
