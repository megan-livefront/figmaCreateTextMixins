figma.showUI(__html__);

// type TextStyleData = {
//   fontName: string;
//   fontSize: string;
//   lineHeight: string;
//   letterSpacing: string;
//   desktopFontSize?: string;
//   desktopLineHeight?: string;
//   desktopLetterSpacing?: string;
// };

// type TextStyleField = "fontSize" | "lineHeight" | "letterSpacing";

// type FigmaVariableValue =
//   | string
//   | number
//   | boolean
//   | RGB
//   | VariableAlias
//   | undefined;

type Mode = {
  modeId: string;
  name: string;
};

type ModeMap = {
  [modeId: string]: VariableValue;
};

// type FieldWithValue = {
//   value: string | number;
// };

/** Generates sass mixins for all font data. */
figma.ui.onmessage = async (msg: {
  type: string;
  format: string;
  collectionId: string;
}) => {
  if (msg.type === "create-mixins") {
    await printFormattedVariables(msg.format, msg.collectionId);
  }

  if (msg.type === "load-collections") {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const collectionNames = collections.map((collection) => ({
      name: collection.name,
      id: collection.id,
    }));

    figma.ui.postMessage({
      type: "collections-loaded",
      collections: collectionNames,
    });
  }

  if (msg.type === "collection-selected") {
    const collection = await figma.variables.getVariableCollectionByIdAsync(
      msg.collectionId
    );

    const collectionVariables = [];
    collection?.variableIds.map(async (id) => {
      const variable = await figma.variables.getVariableByIdAsync(id);
      collectionVariables.push(variable);
    });

    if (!collection) return;

    const formattingVars = [`${toCamelCase(collection.name)}VarName`];
    collection.modes.forEach((mode) => formattingVars.push(mode.name));

    figma.ui.postMessage({
      type: "collection-vars-loaded",
      formattingVars,
    });
  }
};

/** Returns a camelcase string with dashes and slashes removed. */
function toCamelCase(str: string) {
  return str
    .replace(/[/\\-]/g, "") // Remove slashes (both / and \) and dashes (-)
    .replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, (match, index) =>
      index === 0 ? match.toLowerCase() : match.toUpperCase()
    )
    .replace(/\s+/g, "") // Remove spaces
    .replace(/^(.)/, (match) => match.toLowerCase()); // Make first character lowercase
}

/** Returns all variables in a collection. */
async function getCollectionVariables(collection: VariableCollection) {
  const collectionVars: Variable[] = [];

  await Promise.all(
    collection.variableIds.map(async (variableId) => {
      const collectionVar = await figma.variables.getVariableByIdAsync(
        variableId
      );

      if (collectionVar) collectionVars.push(collectionVar);
    })
  );

  return collectionVars;
}

/** Posts a message to the UI with all variables in the collection in the given format. */
async function printFormattedVariables(format: string, collectionId: string) {
  // get the selected collection
  const collection = await figma.variables.getVariableCollectionByIdAsync(
    collectionId
  );

  if (!collection || collection.variableIds.length < 1) return;

  // get all variables in the collection
  const collectionVars: Variable[] = await getCollectionVariables(collection);

  let collectionVarsHtml = "";

  // Convert the input format string to an html string
  const formatHtmlString = transformString(format);

  await Promise.all(
    collectionVars.map(async (collectionVar) => {
      // get the variable's values for each mode in the collection in the format [{ [mode1Name]: 20 }, { [mode2Name]: 40 }]
      const modeValuesForVariable: ModeMap[] = await getModeValuesForVariable(
        collectionVar,
        collection.modes
      );

      // put all mode value objects from the `modeValuesForVariable` array into one object
      const allModeValuesObject = Object.assign({}, ...modeValuesForVariable);

      // create the object that tells `insertVariables` what values to replace and with what value
      const varNameKey = `${toCamelCase(collection.name)}VarName`;
      const variablesToReplaceWithValues = {
        [varNameKey]: toCamelCase(collectionVar.name),
        ...allModeValuesObject,
      };

      console.log("VARIABLES OBJECT", variablesToReplaceWithValues);

      // create the html string that has the values from the variable in it
      const htmlStringWithRealValues = insertVariables(
        formatHtmlString,
        variablesToReplaceWithValues
      );

      // add the created html string to the main html string that will be presented to the user
      collectionVarsHtml += htmlStringWithRealValues;
    })
  );

  figma.ui.postMessage({ type: "mixins-created", mixins: collectionVarsHtml });
}

/** Returns the variables values for each of the given modes. */
async function getModeValuesForVariable(
  variable: Variable,
  modes: Mode[]
): Promise<ModeMap[]> {
  const modeMaps: ModeMap[] = [];

  await Promise.all(
    modes.map(async (mode) => {
      const modeValue = variable.valuesByMode[mode.modeId];
      // Figure out what to do for colors and variable aliases
      if (modeValIsVariableAlias(modeValue)) {
        return await getAliasVariableModeValues(modeValue);
      }

      const modeMap = { [mode.name]: modeValue };
      console.log("GETTING HERE", modeMap);
      modeMaps.push(modeMap);
    })
  );

  return modeMaps;
}

async function getAliasVariableModeValues(modeValue: VariableValue) {
  const aliasId = getAliasModeValueId(modeValue);
  const aliasedVariable = await figma.variables.getVariableByIdAsync(aliasId);

  if (!aliasedVariable) return;

  const aliasedVariableCollection =
    await figma.variables.getVariableCollectionByIdAsync(
      aliasedVariable?.variableCollectionId
    );

  if (!aliasedVariableCollection) return;

  return await getModeValuesForVariable(
    aliasedVariable,
    aliasedVariableCollection.modes
  );
}

/** Returns true if the given mode value is of type variable alias. */
function getAliasModeValueId(value: VariableValue) {
  if (!(typeof value === "object") || !("id" in value)) return "id not found";

  return value.id;
}

/** Returns true if the given mode value is of type variable alias. */
function modeValIsVariableAlias(value: VariableValue) {
  return (
    typeof value === "object" &&
    "type" in value &&
    value.type === "VARIABLE_ALIAS"
  );
}

/** Returns the given input string as an html string with each line as its own `div`. */
function transformString(inputString: string): string {
  // Split the input string into lines based on newlines
  const lines = inputString.split("\n");

  const lineObjectsArray = lines.map((line) => {
    // Count the number of leading tabs
    const tabs = line.match(/\\t/g)?.length || 0;

    // Remove all leading tabs and newlines for the text field
    const text = line.replace(/^\t+/, ""); // Remove leading tabs
    const cleanedText = text.replace(/\\n|\\t/g, ""); // Remove any explicit \n or \t sequences

    return {
      text: cleanedText, // text without \n and \t
      tabs: tabs, // number of leading tabs
    };
  });

  let linesHtml = "";

  lineObjectsArray.forEach((line, index) => {
    const isFirst = index === 0;
    const firstClass = isFirst ? "first-line" : "";
    const isLast = index === lineObjectsArray.length - 1;
    const lastClass = isLast ? "last-line" : "";
    const tabsClass = line.tabs > 0 ? `tab-${line.tabs}` : "";
    const className = `${firstClass} ${lastClass} ${tabsClass}`;

    const lineDiv = `<div class="${className}">${line.text}</div>`;

    linesHtml += lineDiv;
  });

  return linesHtml;
}

function insertVariables(
  inputString: string,
  variables: Record<string, string>
) {
  // Use a regular expression to replace the placeholders in the input string
  return inputString.replace(/\$\{([^}]+)\}/g, (match, variableName) => {
    // Need to make sure we are mapping the aliased variables mode name to the original one we asked the user to use
    console.log("VARIABLE INFO", variables, variableName);
    // Check if the variable exists in the provided variables object
    if (Object.prototype.hasOwnProperty.call(variables, variableName)) {
      return variables[variableName];
    } else {
      // If the variable is not found, return the original placeholder
      return match;
    }
  });
}

// async function getColorDataFromVarId(id: string) {
//   const colorObject = await figma.variables.getVariableByIdAsync(id);
//   if (!colorObject) return;

//   const valueKey = Object.keys(colorObject.valuesByMode)[0];
//   const colorValues = colorObject.valuesByMode[valueKey];

//   return colorValues;
// }

// async function processColors() {
//   let colorsHtml = "";

//   const allVars = await figma.variables.getLocalVariablesAsync();
//   const allColors = allVars.filter((figVar) => figVar.resolvedType === "COLOR");

//   await Promise.all(
//     allColors.map(async (colorVar) => {
//       const valueKey = Object.keys(colorVar.valuesByMode)[0];
//       const colorValues = colorVar.valuesByMode[valueKey];
//       const colorValuesAsVarAlias = colorValues as VariableAlias;
//       const colorData =
//         colorValuesAsVarAlias?.type === "VARIABLE_ALIAS"
//           ? await getColorDataFromVarId(colorValuesAsVarAlias?.id)
//           : colorValues;

//       if (!colorData) return;

//       const colorDataRgba = colorData as RGBA;
//       const stringR = (colorDataRgba?.r * 255)?.toString();
//       const stringG = (colorDataRgba?.g * 255)?.toString();
//       const stringB = (colorDataRgba?.b * 255)?.toString();
//       const stringA = colorDataRgba?.a?.toString();
//       const r = parseInt(stringR);
//       const g = parseInt(stringG);
//       const b = parseInt(stringB);
//       const opacity = stringA ? parseInt(stringA) : 1;
//       const colorName = colorVar.name.replace(/[/\s]/g, "");

//       const colorVarString = `$color${colorName}: rgba(${r}, ${g}, ${b}, ${opacity});`;

//       colorsHtml += `<div>${colorVarString}</div>`;
//     })
//   );

//   figma.ui.postMessage({ type: "mixins-created", mixins: colorsHtml });
// }

// function formatField(
//   value: FigmaVariableValue,
//   field: "lineHeight" | "letterSpacing",
//   style: TextStyle
// ) {
//   const unit = style[field].unit;

//   if (unit === "PERCENT") return `${value}%`;
//   else if (unit === "PIXELS") return `rem(${value}px)`;
//   else return value?.toString() || "";
// }
