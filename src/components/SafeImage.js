// src/components/SafeImage.jsx
import React, { useState } from "react";
import placeholderImg from "../images/not-available.png";

export default function SafeImage({ src, alt = "", ...imgProps }) {
  const [imgSrc, setImgSrc] = useState(src || placeholderImg);

  return (
    <img
      src={imgSrc}
      alt={alt}
      onError={() => {
        // only swap once to avoid loops
        if (imgSrc !== placeholderImg) setImgSrc(placeholderImg);
      }}
      {...imgProps}
    />
  );
}
