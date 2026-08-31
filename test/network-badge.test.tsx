<<<<<<< HEAD
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from './test-utils'
import { NetworkBadge } from '@/components/NetworkBadge'
=======
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from './test-utils'
import { NetworkBadge } from '@/components/NetworkBadge'
import { Networks } from '@stellar/stellar-sdk'
>>>>>>> 15f530f (feat: add NetworkBadge component and integrate into AppShell; enhance backend URL configuration and update encryption methods for improved security (#165))

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

<<<<<<< HEAD
    // ThemeProvider injects its own <script>, so assert on the badge span
    // rather than on the container being empty.
    const { container } = renderWithProviders(<NetworkBadge />)
    expect(container.querySelector('span')).toBeNull()
=======
    const { container } = renderWithProviders(<NetworkBadge />)
    expect(container.firstChild).toBeNull()
>>>>>>> 15f530f (feat: add NetworkBadge component and integrate into AppShell; enhance backend URL configuration and update encryption methods for improved security (#165))
  })

  it('does not render when wallet is connected but network is unknown', () => {
    mockUseWallet.mockReturnValue({
      walletNetwork: null,
      isConnected: true,
    })

    const { container } = renderWithProviders(<NetworkBadge />)
<<<<<<< HEAD
    expect(container.querySelector('span')).toBeNull()
=======
    expect(container.firstChild).toBeNull()
>>>>>>> 15f530f (feat: add NetworkBadge component and integrate into AppShell; enhance backend URL configuration and update encryption methods for improved security (#165))
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
<<<<<<< HEAD
    expect(badge).toHaveClass('bg-yellow-100')
=======
    expect(badge.parentElement).toHaveClass('bg-yellow-100')
>>>>>>> 15f530f (feat: add NetworkBadge component and integrate into AppShell; enhance backend URL configuration and update encryption methods for improved security (#165))
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
<<<<<<< HEAD
    expect(badge).toHaveClass('bg-purple-100')
=======
    expect(badge.parentElement).toHaveClass('bg-purple-100')
>>>>>>> 15f530f (feat: add NetworkBadge component and integrate into AppShell; enhance backend URL configuration and update encryption methods for improved security (#165))
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
