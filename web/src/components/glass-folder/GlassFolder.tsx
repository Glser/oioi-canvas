"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { mountGlassFolder, type GlassFolderOptions } from "./GlassFolderEngine.js";
import type { MotionController } from "./motion-runtime";

export type GlassFolderHandle = { startEdit: () => void };

export const GlassFolder = forwardRef<GlassFolderHandle, { options?: GlassFolderOptions; className?: string }>(
  function GlassFolder({ options, className }, ref) {
    const host = useRef<HTMLDivElement>(null);
    const controller = useRef<MotionController | null>(null);
    useEffect(() => {
      const instance = mountGlassFolder(host.current!, options);
      controller.current = instance;
      return () => { instance.destroy(); controller.current = null; };
      // Options are updated below without remounting the state machine.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => { controller.current?.update(options ?? {}); }, [options]);
    useImperativeHandle(ref, () => ({ startEdit: () => controller.current?.startEdit?.() }), []);
    return <div ref={host} className={className} data-motion-component="glass-folder" />;
  },
);
