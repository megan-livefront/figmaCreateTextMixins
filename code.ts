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
  if (msg.type === "create-text-mixins") {
    const styles = await figma.getLocalTextStylesAsync();

    processStyles(styles).then((result) => {
      const formattedMixins = convertMixinsToSassFormat(result);

      figma.ui.postMessage({ type: "mixins-created", mixins: formattedMixins });
    });
  }

  if (msg.type === "create-color-vars") {
    await processColors();
  }

  if (msg.type === "create-spacing-mixins") {
    await processSpacingMixins();
  }
};

async function processSpacingMixins() {
  const allCollections =
    await figma.variables.getLocalVariableCollectionsAsync();
  const spacingCollections = allCollections.filter(
    (collection) => collection.name === "Spacing"
  );

  if (spacingCollections.length < 1) return;

  const spacingCollection = spacingCollections[0];
  const spacingVars: Variable[] = [];

  await Promise.all(
    spacingCollection.variableIds.map(async (variableId) => {
      const spacingVar = await figma.variables.getVariableByIdAsync(variableId);

      if (spacingVar) spacingVars.push(spacingVar);
    })
  );

  let spacingVarsHtml = "";

  spacingVars.forEach((spacingVar) => {
    const valuesByModeKeys = Object.keys(spacingVar.valuesByMode);
    const breakpointValues: number[] = [];
    valuesByModeKeys.forEach((key) =>
      breakpointValues.push(spacingVar.valuesByMode[key] as number)
    );
    const mobileVal = Math.min(...breakpointValues);
    const desktopVal = Math.max(...breakpointValues);
    const spacingVarName = spacingVar.name.replace(/-(.)/g, (match, p1) =>
      p1.toUpperCase()
    );

    spacingVarsHtml += `<div class="spacing-function">@function ${spacingVarName} {</div>`;
    spacingVarsHtml += `<div class="spacing-value">fluid(${mobileVal}, ${desktopVal});</div>`;
    spacingVarsHtml += `<div>}</div>`;
  });

  figma.ui.postMessage({ type: "mixins-created", mixins: spacingVarsHtml });
}

async function getColorDataFromVarId(id: string) {
  const colorObject = await figma.variables.getVariableByIdAsync(id);
  if (!colorObject) return;

  const valueKey = Object.keys(colorObject.valuesByMode)[0];
  const colorValues = colorObject.valuesByMode[valueKey];

  return colorValues;
}

async function processColors() {
  let colorsHtml = "";

  const allVars = await figma.variables.getLocalVariablesAsync();
  const allColors = allVars.filter((figVar) => figVar.resolvedType === "COLOR");

  await Promise.all(
    allColors.map(async (colorVar) => {
      const valueKey = Object.keys(colorVar.valuesByMode)[0];
      const colorValues = colorVar.valuesByMode[valueKey];
      const colorData =
        colorValues.type === "VARIABLE_ALIAS"
          ? await getColorDataFromVarId(colorValues.id)
          : colorValues;

      if (!colorData) return;

      const stringR = (colorData.r * 255)?.toString();
      const stringG = (colorData.g * 255)?.toString();
      const stringB = (colorData.b * 255)?.toString();
      const stringA = colorData.a?.toString();
      const r = parseInt(stringR);
      const g = parseInt(stringG);
      const b = parseInt(stringB);
      const opacity = parseInt(stringA);
      const colorName = colorVar.name.replace(/[/\s]/g, "");

      const colorVarString = `$color${colorName}: rgba(${r}, ${g}, ${b}, ${opacity});`;

      colorsHtml += `<div>${colorVarString}</div>`;
    })
  );

  figma.ui.postMessage({ type: "mixins-created", mixins: colorsHtml });
}

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
