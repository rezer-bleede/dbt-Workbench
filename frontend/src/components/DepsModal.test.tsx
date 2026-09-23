import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DepsModal } from './DepsModal';
import { ExecutionService } from '../services/executionService';
import { PackagesCheckResponse } from '../types';

vi.mock('../services/executionService', () => ({
  ExecutionService: {
    installPackages: vi.fn(),
    getRunStatus: vi.fn(),
    createLogStream: vi.fn(),
  },
}));

const mockExecutionService = ExecutionService as unknown as {
  installPackages: ReturnType<typeof vi.fn>;
  getRunStatus: ReturnType<typeof vi.fn>;
  createLogStream: ReturnType<typeof vi.fn>;
};

class MockEventSource {
  listeners: Record<string, ((event: MessageEvent) => void)[]> = {};
  close = vi.fn();

  addEventListener(event: string, listener: (e: MessageEvent) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  removeEventListener(event: string, listener: (e: MessageEvent) => void) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(l => l !== listener);
    }
  }

  emit(event: string, data: any) {
    if (this.listeners[event]) {
      const msgEvent = new MessageEvent(event, { data: JSON.stringify(data) });
      this.listeners[event].forEach(l => l(msgEvent));
    }
  }
}

describe('DepsModal', () => {
  const sampleCheck: PackagesCheckResponse = {
    has_missing: true,
    packages_required: ['dbt_utils', 'dbt_expectations', 'audit_helper'],
    packages_installed: ['dbt_utils'],
    missing_packages: ['dbt_expectations', 'audit_helper'],
    packages_yml_exists: true,
  };

  const onInstallComplete = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders missing and installed packages', () => {
    render(
      <DepsModal
        packagesCheck={sampleCheck}
        onInstallComplete={onInstallComplete}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('Missing dbt Packages')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 required packages are not installed')).toBeInTheDocument();
    expect(screen.getByText('dbt_expectations')).toBeInTheDocument();
    expect(screen.getByText('audit_helper')).toBeInTheDocument();
    expect(screen.getByText('dbt_utils')).toBeInTheDocument();
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    render(
      <DepsModal
        packagesCheck={sampleCheck}
        onInstallComplete={onInstallComplete}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  describe('installation execution', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('handles installation flow and shows logs and Continue button on success', async () => {
      const mockEventSource = new MockEventSource();
      mockExecutionService.installPackages.mockResolvedValue({
        run_id: 'deps-run-1',
        command: 'deps',
        status: 'running',
      });
      mockExecutionService.createLogStream.mockReturnValue(mockEventSource);
      mockExecutionService.getRunStatus.mockResolvedValue({
        run_id: 'deps-run-1',
        command: 'deps',
        status: 'succeeded',
      });

      render(
        <DepsModal
          packagesCheck={sampleCheck}
          onInstallComplete={onInstallComplete}
          onCancel={onCancel}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Install Packages' }));

      await waitFor(() => {
        expect(mockExecutionService.installPackages).toHaveBeenCalled();
      });

      // Emit live SSE log
      act(() => {
        mockEventSource.emit('log', {
          run_id: 'deps-run-1',
          message: 'Running dbt deps...',
        });
      });

      expect(screen.getByText('Running dbt deps...')).toBeInTheDocument();

      // Fast forward polling interval
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.getByText('Continue')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText('Continue'));
      expect(onInstallComplete).toHaveBeenCalled();
    });

    it('displays error and Retry button when installation fails', async () => {
      const mockEventSource = new MockEventSource();
      mockExecutionService.installPackages.mockResolvedValue({
        run_id: 'deps-run-2',
        command: 'deps',
        status: 'running',
      });
      mockExecutionService.createLogStream.mockReturnValue(mockEventSource);
      mockExecutionService.getRunStatus.mockResolvedValue({
        run_id: 'deps-run-2',
        command: 'deps',
        status: 'failed',
        error_message: 'dbt deps failed with exit code 1',
      });

      render(
        <DepsModal
          packagesCheck={sampleCheck}
          onInstallComplete={onInstallComplete}
          onCancel={onCancel}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Install Packages' }));

      await waitFor(() => {
        expect(mockExecutionService.installPackages).toHaveBeenCalled();
      });

      // Fast forward polling interval
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.getByText('dbt deps failed with exit code 1')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      });
    });
  });
});
