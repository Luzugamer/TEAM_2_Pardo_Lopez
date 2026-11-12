import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import { Alert, Button, Modal } from '../../design-system/atoms';

type CameraQrScannerProps = {
  open: boolean;
  onClose: () => void;
  onDetected: (rawValue: string) => void;
  copy: { title: string; description: string; starting: string; ready: string; error: string; stop: string };
};

/** Opens a camera only while its modal is visible and always releases its tracks on exit. */
export function CameraQrScanner({ open, onClose, onDetected, copy }: CameraQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onDetectedRef = useRef(onDetected);
  const [state, setState] = useState<'starting' | 'ready' | 'error'>('starting');

  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  useEffect(() => {
    if (!open || !videoRef.current) return;
    let active = true;
    let detected = false;
    const reader = new BrowserQRCodeReader();
    setState('starting');
    const startupTimeout = window.setTimeout(() => {
      if (active && !controlsRef.current) setState('error');
    }, 10_000);
    void reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _decodeError, controls) => {
      controlsRef.current = controls;
      if (!active || !result || detected) return;
      detected = true;
      controls.stop();
      onDetectedRef.current(result.getText());
    }).then((controls) => {
      controlsRef.current = controls;
      window.clearTimeout(startupTimeout);
      if (!active) { controls.stop(); return; }
      setState('ready');
    }).catch(() => {
      window.clearTimeout(startupTimeout);
      if (active) setState('error');
    });

    return () => {
      active = false;
      window.clearTimeout(startupTimeout);
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open]);

  const close = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    onClose();
  };

  return <Modal open={open} title={copy.title} description={copy.description} onClose={close}>
    <div className="nx-camera-preview" aria-busy={state === 'starting'}>
      <video ref={videoRef} autoPlay muted playsInline aria-label={copy.title} />
      <div className="nx-camera-guide" aria-hidden="true" />
    </div>
    <div className="nx-camera-status" role="status" aria-live="polite">
      {state === 'starting' && copy.starting}{state === 'ready' && copy.ready}
    </div>
    {state === 'error' && <Alert tone="danger">{copy.error}</Alert>}
    <div className="nx-camera-actions"><Button variant="secondary" onClick={close}>{copy.stop}</Button></div>
  </Modal>;
}
