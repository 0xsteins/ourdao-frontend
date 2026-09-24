import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from './test-utils'
import { NetworkBadge } from '@/components/NetworkBadge'
import { Networks } from '@stellar/stellar-sdk'

const mockUseWallet = vi.fn()

vi.mock('@/lib/wallet', () => ({
  useWallet: () => mockUseWallet(),
}))

describe('NetworkBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render when wallet is not connected', () => {
    mockUseWallet.mockReturnValue({
      walletNetwork: null,
      isConnected: false,
    })

    const { container } = renderWithProviders(<NetworkBadge />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render when wallet is connected but network is unknown', () => {
    mockUseWallet.mockReturnValue({
      walletNetwork: null,
      isConnected: true,
    })

    const { container } = renderWithProviders(<NetworkBadge />)
    expect(container.firstChild).toBeNull()
  })

  it('renders Mainnet label for PUBLIC network', () => {
    mockUseWallet.mockReturnValue({
      walletNetwork: 'PUBLIC',
      isConnected: true,
    })

    renderWithProviders(<NetworkBadge />)
    expect(screen.getByText('Mainnet')).toBeInTheDocument()
  })

  it('renders Testnet label with visual prominence for TESTNET network', () => {
    mockUseWallet.mockReturnValue({
      walletNetwork: 'TESTNET',
      isConnected: true,
    })

    renderWithProviders(<NetworkBadge />)
    const badge = screen.getByText('Testnet')
    expect(badge).toBeInTheDocument()
    // Testnet has yellow styling for visual distinction
    expect(badge.parentElement).toHaveClass('bg-yellow-100')
  })

  it('renders Futurenet label with visual prominence for FUTURENET network', () => {
    mockUseWallet.mockReturnValue({
      walletNetwork: 'FUTURENET',
      isConnected: true,
    })

    renderWithProviders(<NetworkBadge />)
    const badge = screen.getByText('Futurenet')
    expect(badge).toBeInTheDocument()
    // Futurenet has purple styling for visual distinction
    expect(badge.parentElement).toHaveClass('bg-purple-100')
  })

  it('renders unknown network name as-is when not in predefined config', () => {
    mockUseWallet.mockReturnValue({
      walletNetwork: 'Custom Network',
      isConnected: true,
    })

    renderWithProviders(<NetworkBadge />)
    expect(screen.getByText('Custom Network')).toBeInTheDocument()
  })
})
