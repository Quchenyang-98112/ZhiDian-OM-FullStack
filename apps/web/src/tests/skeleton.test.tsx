import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageSkeleton, SkeletonBar, SkeletonCard, TabSkeleton } from '../components/ui/Skeleton';

describe('Skeleton placeholders', () => {
  it('renders a single skeleton bar with custom classes', () => {
    const { container } = render(<SkeletonBar className="h-8 w-full" />);
    expect(container.firstChild).toHaveClass('skeleton', 'h-8', 'w-full');
  });

  it('renders a card skeleton with the requested number of lines', () => {
    const { container } = render(<SkeletonCard lines={2} />);
    expect(container.querySelectorAll('.skeleton')).toHaveLength(3);
  });

  it('renders tab and page loading skeletons with status landmarks', () => {
    render(
      <>
        <TabSkeleton />
        <PageSkeleton />
      </>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByRole('heading', { level: 1, hidden: true })).toBeInTheDocument();
  });
});
