/**
 * SettingsModal — modal dialog for configuring API key, model, and CoT samples.
 *
 * Features focus trapping (Tab/Shift+Tab), Escape-to-close, and
 * outside-click-to-close. API key is persisted in sessionStorage.
 *
 * @param {object}   props
 * @param {boolean}  props.isOpen           - Whether the modal is visible
 * @param {function} props.onClose          - Closes the modal
 * @param {object}   props.settings         - Current settings state
 * @param {function} props.onSettingsChange - Updates settings
 */
import React, { useEffect, useRef } from 'react';
import { STORAGE_KEYS } from '../utils/constants';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function SettingsModal({ isOpen, onClose, settings, onSettingsChange }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const el = modalRef.current;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !el) return;
      const focusables = el.querySelectorAll(FOCUSABLE);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const handleClick = (e) => {
      if (el && !el.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    const focusables = el?.querySelectorAll(FOCUSABLE);
    if (focusables?.length) focusables[0].focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const update = (key, value) => {
    const next = { ...settings, [key]: value };
    onSettingsChange(next);
    if (key === 'apiKey') sessionStorage.setItem(STORAGE_KEYS.apiKey, value);
  };

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="settings-modal" ref={modalRef}>
        <div className="settings-header">
          <h3 id="settings-title">Settings</h3>
          <button type="button" className="settings-close" onClick={onClose} aria-label="Close settings">&times;</button>
        </div>
        <div className="settings-body">
          <div className="input-group">
            <label>OpenAI API Key</label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => update('apiKey', e.target.value)}
              placeholder="sk-..."
            />
          </div>
          <div className="input-group">
            <label>Model</label>
            <select value={settings.model} onChange={(e) => update('model', e.target.value)}>
              <option value="gpt-4o-mini">gpt-4o-mini (fast, cheap)</option>
              <option value="gpt-4o">gpt-4o (powerful)</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
              <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
            </select>
          </div>
          <div className="input-group">
            <label>CoT Samples (Self-Consistency): {settings.nSamples}</label>
            <input
              type="range"
              min={1}
              max={15}
              value={settings.nSamples}
              onChange={(e) => update('nSamples', Number(e.target.value))}
            />
          </div>
          <div className="input-group input-group-checkbox">
            <label>
              <input
                type="checkbox"
                checked={!!settings.showCostEstimate}
                onChange={(e) => update('showCostEstimate', e.target.checked)}
              />
              Show cost estimate in comparison
            </label>
          </div>
          {!settings.apiKey && (
            <p className="settings-hint">
              Enter your OpenAI API key to start running frameworks.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
