/** Abbreviate a 0x-hex address for display: `0x1234…cdef`. */
export function abbreviateAddress(address: string, lead = 6, tail = 4): string {
  return address.length <= lead + tail + 1
    ? address
    : `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
