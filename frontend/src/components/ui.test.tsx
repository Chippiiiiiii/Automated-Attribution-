import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClassBadge, DemoBadge, DISCLAIMER, ErrorText, RiskBadge, classLabel, shortAddr } from './ui';

describe('ui helpers', () => {
  it('shortens long addresses only', () => {
    expect(shortAddr('0x123')).toBe('0x123');
    const s = shortAddr('0x1234567890abcdef1234567890abcdef12345678');
    expect(s).toMatch(/^0x123456…345678$/);
  });

  it('formats attribution classes as labels, never as confirmed identity wording', () => {
    expect(classLabel('STRONGLY_INFERRED')).toBe('Strongly inferred');
    render(<ClassBadge value="PROBABLE" />);
    expect(screen.getByText('Probable')).toBeInTheDocument();
  });

  it('marks demo data and renders risk level', () => {
    render(<><DemoBadge /><RiskBadge value="HIGH" /></>);
    expect(screen.getByText('DEMO')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('renders errors as alerts and nothing when empty', () => {
    const { rerender, container } = render(<ErrorText>boom</ErrorText>);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    rerender(<ErrorText>{''}</ErrorText>);
    expect(container).toBeEmptyDOMElement();
  });

  it('carries the mandatory inference disclaimer', () => {
    expect(DISCLAIMER).toBe('Blockchain attribution is an analytical inference and does not by itself establish beneficial ownership.');
  });
});
