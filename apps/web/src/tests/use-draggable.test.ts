import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDraggable } from '../components/live-energy-flow/hooks/useDraggable';

function keyEvent(key: string, shiftKey = false): React.KeyboardEvent {
  return { key, shiftKey, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

describe('useDraggable', () => {
  it('starts at the initial position', () => {
    const { result } = renderHook(() => useDraggable({ x: 10, y: 20 }));
    expect(result.current.pos).toEqual({ x: 10, y: 20 });
  });

  it('nudges by 10px on arrow keys', () => {
    const { result } = renderHook(() => useDraggable({ x: 100, y: 100 }));
    act(() => result.current.onKeyDown(keyEvent('ArrowRight')));
    expect(result.current.pos).toEqual({ x: 110, y: 100 });
    act(() => result.current.onKeyDown(keyEvent('ArrowUp')));
    expect(result.current.pos).toEqual({ x: 110, y: 90 });
  });

  it('nudges by 50px when Shift is held', () => {
    const { result } = renderHook(() => useDraggable({ x: 100, y: 100 }));
    act(() => result.current.onKeyDown(keyEvent('ArrowLeft', true)));
    expect(result.current.pos).toEqual({ x: 50, y: 100 });
    act(() => result.current.onKeyDown(keyEvent('ArrowDown', true)));
    expect(result.current.pos).toEqual({ x: 50, y: 150 });
  });

  it('ignores non-arrow keys', () => {
    const { result } = renderHook(() => useDraggable({ x: 5, y: 5 }));
    act(() => result.current.onKeyDown(keyEvent('Enter')));
    expect(result.current.pos).toEqual({ x: 5, y: 5 });
  });
});
