export const AA_NORMAL_TEXT = 4.5
export const AA_LARGE_TEXT = 3

export async function measureText({ page, rootSelector }) {
  return page.evaluate((selector) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })

    function paint(color, backdrop) {
      context.fillStyle = backdrop
      context.fillRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const data = context.getImageData(0, 0, 1, 1).data
      return [data[0], data[1], data[2]]
    }

    function parse(color) {
      const onWhite = paint(color, '#ffffff')
      const onBlack = paint(color, '#000000')
      const alpha = Math.min(1, Math.max(0, 1 - (onWhite[0] - onBlack[0] + onWhite[1] - onBlack[1] + onWhite[2] - onBlack[2]) / (3 * 255)))
      if (alpha === 0) {
        return { r: 0, g: 0, b: 0, a: 0 }
      }
      return { r: onBlack[0] / alpha, g: onBlack[1] / alpha, b: onBlack[2] / alpha, a: alpha }
    }

    function over(top, bottom) {
      const a = top.a + bottom.a * (1 - top.a)
      if (a === 0) {
        return { r: 0, g: 0, b: 0, a: 0 }
      }
      return {
        r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
        g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
        b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
        a,
      }
    }

    function backdropOf(element) {
      const layers = []
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        layers.push(parse(style.backgroundColor))
        if (style.backgroundImage !== 'none') {
          layers.push({ r: 128, g: 128, b: 128, a: 0, gradient: true })
        }
      }
      const page = { r: 255, g: 255, b: 255, a: 1 }
      return layers.reduceRight((below, layer) => over(layer, below), page)
    }

    function opacityOf(element) {
      let value = 1
      for (let node = element; node; node = node.parentElement) {
        value *= Number(getComputedStyle(node).opacity)
      }
      return value
    }

    function channel(value) {
      const unit = value / 255
      return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
    }

    function luminance(color) {
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
    }

    function ratio(a, b) {
      const [light, dark] = luminance(a) >= luminance(b) ? [a, b] : [b, a]
      return (luminance(light) + 0.05) / (luminance(dark) + 0.05)
    }

    const root = document.querySelector(selector)
    if (!root) {
      return []
    }
    const rows = []
    root.querySelectorAll('*').forEach((element) => {
      const ownText = [...element.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent.trim()).join(' ').trim()
      if (ownText.length === 0) {
        return
      }
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      if (style.visibility === 'hidden' || style.display === 'none' || box.width === 0 || box.height === 0) {
        return
      }
      if (element.closest('[disabled], [aria-disabled="true"]')) {
        return
      }
      const backdrop = backdropOf(element)
      const foreground = parse(style.color)
      const alpha = foreground.a * opacityOf(element)
      const shown = over({ ...foreground, a: alpha }, { ...backdrop, a: 1 })
      const size = Number.parseFloat(style.fontSize)
      const weight = Number(style.fontWeight)
      rows.push({
        text: ownText.slice(0, 40),
        tag: element.tagName.toLowerCase(),
        ratio: Math.round(ratio(shown, { ...backdrop, a: 1 }) * 100) / 100,
        large: size >= 24 || (size >= 18.66 && weight >= 700),
        foreground: `rgb(${Math.round(shown.r)}, ${Math.round(shown.g)}, ${Math.round(shown.b)})`,
        background: `rgb(${Math.round(backdrop.r)}, ${Math.round(backdrop.g)}, ${Math.round(backdrop.b)})`,
      })
    })
    return rows
  }, rootSelector)
}

export function belowAa(rows) {
  return rows.filter((row) => row.ratio < (row.large ? AA_LARGE_TEXT : AA_NORMAL_TEXT))
}

export function describeFailures(rows) {
  return belowAa(rows).slice(0, 6).map((row) => `「${row.text}」${row.ratio}（${row.foreground} 在 ${row.background} 上）`).join('；')
}
