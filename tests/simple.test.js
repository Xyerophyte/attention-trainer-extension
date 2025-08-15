/**
 * Simple Test to Validate Basic Setup
 */

describe('Basic Setup Validation', () => {
  it('should run a basic test', () => {
    expect(1 + 1).toBe(2)
  })

  it('should have Jest working', () => {
    const mockFn = jest.fn()
    mockFn('test')
    expect(mockFn).toHaveBeenCalledWith('test')
  })

  it('should have basic DOM available', () => {
    const div = document.createElement('div')
    div.textContent = 'Hello World'
    expect(div.textContent).toBe('Hello World')
  })

  it('should have console available', () => {
    // This should not throw
    console.log('Test log message')
    expect(typeof console.log).toBe('function')
  })

  it('should be able to create promises', async () => {
    const result = await Promise.resolve('success')
    expect(result).toBe('success')
  })

  it('should have setTimeout working', (done) => {
    setTimeout(() => {
      expect(true).toBe(true)
      done()
    }, 10)
  })
})
