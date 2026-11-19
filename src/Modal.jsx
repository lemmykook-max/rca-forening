import React, { useEffect } from "react";

export function Modal({ children, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ textAlign: "right" }}><button className="btn ghost small" onClick={onClose}>Luk</button></div>
        {children}
      </div>
    </div>
  );
}

