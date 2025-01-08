figma.showUI(__html__);

type TextStyleData = {
  fontName: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  desktopFontSize?: string;
  desktopLineHeight?: string;
  desktopLetterSpacing?: string;
};

type TextStyleField = "fontSize" | "lineHeight" | "letterSpacing";

type FigmaVariableValue =
  | string
  | number
  | boolean
  | RGB
  | VariableAlias
  | undefined;

type FieldWithValue = {
  value: string | number;
};

/** Generates sass mixins for all font data. */
figma.ui.onmessage = async (msg: { type: string }) => {
  if (msg.type === "create-sass-mixins") {
    const styles = await figma.getLocalTextStylesAsync();

    processStyles(styles).then((result) => {
      const formattedMixins = convertMixinsToSassFormat(result);

      figma.ui.postMessage({ type: "mixins-created", mixins: formattedMixins });
    });
  }
};

async function processStyles(styles: TextStyle[]) {
  const allTextStyleData = await Promise.all(
    styles.map(async (style) => {
      const textStyleData = await getTextStyleData(style);
      return textStyleData; // Return the data for this style
    })
  );

  return allTextStyleData;
}

async function getTextStyleData(style: TextStyle): Promise<TextStyleData> {
  const fontSize = await getVariableBreakpointValue(
    style,
    "fontSize",
    "mobile"
  );
  const lineHeight = await getVariableBreakpointValue(
    style,
    "lineHeight",
    "mobile"
  );
  const letterSpacing = await getVariableBreakpointValue(
    style,
    "letterSpacing",
    "mobile"
  );
  const desktopFontSize = await getVariableBreakpointValue(
    style,
    "fontSize",
    "desktop"
  );
  const desktopLineHeight = await getVariableBreakpointValue(
    style,
    "lineHeight",
    "desktop"
  );
  const desktopLetterSpacing = await getVariableBreakpointValue(
    style,
    "letterSpacing",
    "desktop"
  );

  return {
    fontName: style.name.replace(/[/\s]/g, ""),
    fontSize: `rem(${fontSize}px)`,
    letterSpacing: formatField(letterSpacing, "letterSpacing", style),
    lineHeight: formatField(lineHeight, "lineHeight", style),
    desktopFontSize: desktopFontSize ? `rem(${desktopFontSize}px)` : undefined,
    desktopLineHeight: desktopLineHeight
      ? formatField(lineHeight, "lineHeight", style)
      : undefined,
    desktopLetterSpacing: desktopLetterSpacing
      ? formatField(letterSpacing, "letterSpacing", style)
      : undefined,
  };
}

function formatField(
  value: FigmaVariableValue,
  field: "lineHeight" | "letterSpacing",
  style: TextStyle
) {
  const unit = style[field].unit;

  if (unit === "PERCENT") return `${value}%`;
  else if (unit === "PIXELS") return `rem(${value}px)`;
  else return value?.toString() || "";
}

async function getVariableBreakpointValue(
  style: TextStyle,
  field: TextStyleField,
  breakpoint: "mobile" | "desktop"
) {
  const isMobile = breakpoint === "mobile";
  const variableId = style.boundVariables?.[field]?.id;
  const variableObj = await figma.variables.getVariableByIdAsync(
    variableId || ""
  );

  if (!variableObj) {
    const mobileVal = (style[field] as FieldWithValue)?.value ?? style[field];
    return isMobile ? mobileVal : undefined;
  }

  const variableValuesByMode = variableObj.valuesByMode || {};
  const allModeKeys = Object.keys(variableValuesByMode);

  if (allModeKeys.length > 1) {
    const firstKey = allModeKeys[0];
    const secondKey = allModeKeys[1];
    const firstValue = variableValuesByMode[firstKey];
    const secondValue = variableValuesByMode[secondKey];

    if (!firstValue || !secondValue) return "";

    const firstValLarger = firstValue > secondValue;

    if (firstValue === secondValue && breakpoint === "desktop")
      return undefined;

    const mobile = firstValLarger ? secondValue : firstValue;
    const desktop = firstValLarger ? firstValue : secondValue;

    return breakpoint === "mobile" ? mobile : desktop;
  }
}

function convertMixinsToSassFormat(fontMixins: TextStyleData[]): string {
  const sassMixins = fontMixins.map((mixin) => {
    let mixinString = `<div class="font-styles">@mixin text${mixin.fontName} {</div> <div class="mobile-style">font-size: ${mixin.fontSize};</div> <div class="mobile-style">line-height: ${mixin.lineHeight};</div> <div class="mobile-style">letter-spacing: ${mixin.letterSpacing};</div>`;
    if (
      mixin.desktopFontSize ||
      mixin.desktopLineHeight ||
      mixin.desktopLetterSpacing
    ) {
      mixinString += `<div class="desktop-font-styles">@include desktopAndUp {</div>`;
      if (mixin.desktopFontSize)
        mixinString += `<div class="desktop-style">font-size: ${mixin.desktopFontSize};</div>`;
      if (mixin.desktopLineHeight)
        mixinString += `<div class="desktop-style">line-height: ${mixin.desktopLineHeight};</div>`;
      if (mixin.desktopLetterSpacing)
        mixinString += `<div class="desktop-style">letter-spacing: ${mixin.desktopLetterSpacing};</div>`;
      mixinString += `<div class="desktop-font-styles">}</div>`;
    }
    mixinString += `<div class="font-styles-end">}</div>`;

    return mixinString;
  });

  let allMixins = "";
  sassMixins.forEach((sassMixin) => {
    allMixins += `\n\n ${sassMixin}`;
  });

  return allMixins;
}
