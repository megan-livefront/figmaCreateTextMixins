figma.showUI(__html__);

type FontData = {
  fontName: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  breakpoint: "mobile" | "desktop";
};

type FontMixin = {
  fontName: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
  desktopFontSize?: string;
  desktopLineHeight?: string;
  desktopLetterSpacing?: string;
};

/** Generates sass mixins for all font data. */
figma.ui.onmessage = (msg: { type: string }) => {
  if (msg.type === "create-sass-mixins") {
    const parentFrame = figma.currentPage.selection[0] as FrameNode;
    const fontData = getFontData(parentFrame, "All Styles");
    const fontMixins = fontDataAsMixins(fontData);

    figma.ui.resize(800, 800);
    figma.showUI(fontMixins);
    // console.log(fontMixins);
  }

  // figma.closePlugin();
};

function getFontData(parentFrame: FrameNode, stylesNodeName: string) {
  const fontData: FontData[] = [];
  parentFrame.children.forEach((child) => {
    if (child.type === "FRAME" && child.name === stylesNodeName) {
      const allStylesNode = child;
      allStylesNode.children.forEach((textStyleNode, textStyleNodeIndex) => {
        if (textStyleNode.type === "FRAME" && textStyleNodeIndex !== 0) {
          textStyleNode.children.forEach((breakpointStyleNode) => {
            let fontName = "";
            let fontSize = "";
            let lineHeight = "";
            let letterSpacing = "";
            const breakpoint = breakpointStyleNode.name.includes("Desktop")
              ? "desktop"
              : "mobile";

            if (breakpointStyleNode.type === "FRAME") {
              breakpointStyleNode.children.forEach(
                (styleDetails, styleDetailsIndex) => {
                  if (
                    styleDetails.type === "FRAME" &&
                    styleDetailsIndex === 0
                  ) {
                    fontName = (
                      styleDetails.children[0] as TextNode
                    ).characters.replace(/\s+/g, "");
                  } else if (
                    styleDetails.type === "FRAME" &&
                    styleDetailsIndex === 1
                  ) {
                    styleDetails.children.forEach((fontData, index) => {
                      if (index === 0)
                        fontSize = (fontData as TextNode).characters;
                      else if (index === 1)
                        lineHeight = (fontData as TextNode).characters;
                      else if (index === 2)
                        letterSpacing = (fontData as TextNode).characters;
                    });
                  }
                }
              );
              fontData.push({
                fontName,
                fontSize,
                lineHeight,
                letterSpacing,
                breakpoint,
              });
            }
          });
        }
      });
    }
  });

  return fontData;
}

function fontDataAsMixins(fontData: FontData[]): string {
  const mixins: FontMixin[] = [];
  const mobileStyles: FontData[] = fontData.filter(
    (item) => item.breakpoint === "mobile"
  );
  const desktopStyles: FontData[] = fontData.filter(
    (item) => item.breakpoint === "desktop"
  );

  mobileStyles.forEach((mobileStyle) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { breakpoint, ...mixinData } = mobileStyle;
    const mixin: FontMixin = mixinData;

    const desktopEquivalent = desktopStyles.find(
      (desktopStyle) => desktopStyle.fontName === mobileStyle.fontName
    );

    if (desktopEquivalent) {
      if (desktopEquivalent.fontSize !== mobileStyle.fontSize) {
        mixin.desktopFontSize = desktopEquivalent.fontSize;
      }
      if (desktopEquivalent.lineHeight !== mobileStyle.lineHeight) {
        mixin.desktopLineHeight = desktopEquivalent.lineHeight;
      }
      if (desktopEquivalent.letterSpacing !== mobileStyle.letterSpacing) {
        mixin.desktopLetterSpacing = desktopEquivalent.letterSpacing;
      }
    }
    mixins.push(mixin);
  });

  const sassMixins = convertMixinsToSassFormat(mixins);

  return sassMixins;
}

function convertMixinsToSassFormat(fontMixins: FontMixin[]): string {
  const sassMixins = fontMixins.map((mixin) => {
    let mixinString = `@mixin text${mixin.fontName} {\n\t font-size: rem(${mixin.fontSize});\n\t line-height: rem(${mixin.lineHeight});\n\t letter-spacing: rem(${mixin.letterSpacing});`;
    if (
      mixin.desktopFontSize ||
      mixin.desktopLineHeight ||
      mixin.desktopLetterSpacing
    ) {
      mixinString += `\n\n\t @include desktopAndUp {`;
      if (mixin.desktopFontSize)
        mixinString += `\n\t\t font-size: rem(${mixin.desktopFontSize});`;
      if (mixin.desktopLineHeight)
        mixinString += `\n\t\t line-height: rem(${mixin.desktopLineHeight});`;
      if (mixin.desktopLetterSpacing)
        mixinString += `\n\t\t letter-spacing: rem(${mixin.desktopLetterSpacing});`;
      mixinString += `\n\t }`;
    }
    mixinString += `\n }`;

    return mixinString;
  });

  let allMixins = "";
  sassMixins.forEach((sassMixin) => {
    allMixins += `\n\n ${sassMixin}`;
  });

  return allMixins;
}
