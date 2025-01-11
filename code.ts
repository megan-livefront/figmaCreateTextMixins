figma.showUI(__html__);

type Mode = {
  modeId: string;
  name: string;
};

type ModeMap = {
  [modeId: string]: VariableValue;
};

/** Returns variable data for the selected collection in the given `format`. */
figma.ui.onmessage = async (msg: {
  type: string;
  format: string;
  collectionId: string;
}) => {
  if (msg.type === "format-variable-data") {
    await postFormattedVariables(msg.format, msg.collectionId);
  }

  if (msg.type === "load-collections") {
    await postCollections();
  }

  if (msg.type === "collection-selected") {
    await postCollectionVariableFormattingData(msg.collectionId);
  }
};

/**
 * Posts a message with all variables in the collection in the given format. Each variable field
 * used in the `format` string will be replaced with variable data.
 */
async function postFormattedVariables(format: string, collectionId: string) {
  // get the selected collection
  const collection = await figma.variables.getVariableCollectionByIdAsync(
    collectionId
  );

  if (!collection || collection.variableIds.length < 1) return;

  // get all variables in the collection
  const collectionVars: Variable[] = await getCollectionVariables(collection);

  // Convert the input format string to an html string
  const formatHtmlString = transformFormatStringToHtmlString(format);

  const collectionVarsHtml = await getCollectionVarsHtmlString(
    formatHtmlString,
    collection,
    collectionVars
  );

  figma.ui.postMessage({ type: "mixins-created", mixins: collectionVarsHtml });
}

/** Returns all variables in a collection. */
async function getCollectionVariables(collection: VariableCollection) {
  const collectionVars: Variable[] = [];

  for (const variableId of collection.variableIds) {
    const collectionVar = await figma.variables.getVariableByIdAsync(
      variableId
    );

    if (collectionVar) {
      collectionVars.push(collectionVar);
    }
  }

  return collectionVars;
}

/** Returns the given input string as an html string with each line as its own `div`. */
function transformFormatStringToHtmlString(inputString: string): string {
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

/**
 * Uses `formatHtmlString` to create an html string with dynamic variable data for each
 * variable in `collectionVars`. Returns one large html string with all variable data.
 */
async function getCollectionVarsHtmlString(
  formatHtmlString: string,
  collection: VariableCollection,
  collectionVars: Variable[]
) {
  let collectionVarsHtml = "";
  for (const collectionVar of collectionVars) {
    const modeValuesForVariable: ModeMap[] = await getModeValuesForVariable(
      collectionVar,
      collection.modes
    );

    // put all mode value objects from the `modeValuesForVariable` array into one object
    const allModeValuesObject = getAllModeValuesObject(modeValuesForVariable);

    // create the object that tells `insertVariables` what values to replace and with what value
    const varNameKey = `${toCamelCase(collection.name)}VarName`;
    const variablesToReplaceWithValues = {
      [varNameKey]: toCamelCase(collectionVar.name),
      ...allModeValuesObject,
    };

    // create the html string that has the values from the variable in it
    const htmlStringWithRealValues = insertVariables(
      formatHtmlString,
      variablesToReplaceWithValues
    );

    // add the created html string to the main html string that will be presented to the user
    collectionVarsHtml += htmlStringWithRealValues;
  }

  return collectionVarsHtml;
}

/** Returns the variables values for each of the given modes. */
async function getModeValuesForVariable(
  variable: Variable,
  modes: Mode[],
  aliasOriginalModes?: Mode[]
): Promise<ModeMap[]> {
  const modeMaps: ModeMap[] = [];

  for (const [index, mode] of modes.entries()) {
    const modeValue = variable.valuesByMode[mode.modeId];

    // Figure out what to do for colors
    if (modeValIsVariableAlias(modeValue)) {
      return (await getAliasVariableModeValues(modeValue, modes)) || [];
    } else {
      const modeKey = aliasOriginalModes
        ? aliasOriginalModes[index].name
        : mode.name;

      const modeMap = { [modeKey]: modeValue };
      modeMaps.push(modeMap);
    }
  }

  return modeMaps;
}

/** Returns true if the given mode value is of type variable alias. */
function modeValIsVariableAlias(value: VariableValue) {
  return (
    typeof value === "object" &&
    "type" in value &&
    value.type === "VARIABLE_ALIAS"
  );
}

/** Fetches the aliased variable and returns the mode values for it. */
async function getAliasVariableModeValues(
  modeValue: VariableValue,
  aliasOriginalModes?: Mode[]
): Promise<ModeMap[] | undefined> {
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
    aliasedVariableCollection.modes,
    aliasOriginalModes
  );
}

/** Returns true if the given mode value is of type variable alias. */
function getAliasModeValueId(value: VariableValue) {
  if (!(typeof value === "object") || !("id" in value)) return "id not found";

  return value.id;
}

/**
 * Flattens the `modeValues` array of objects to one object with a key and value for each
 * mode in the collection.
 */
function getAllModeValuesObject(modeValues: ModeMap[]): Record<string, string> {
  const flattenedModeValues: ModeMap = Object.assign({}, ...modeValues);
  const modeNames = Object.keys(flattenedModeValues);
  let modeMapToReturn = flattenedModeValues;
  modeNames.forEach((modeName) => {
    const modeValue = flattenedModeValues[modeName];
    if (typeof modeValue === "object") {
      const keysOfModeValueObject = Object.keys(modeValue);
      const formattedModeValueObject: Record<string, string> = {};
      keysOfModeValueObject.forEach((modeValueKey) => {
        const formattedKey = `${modeName}-${modeValueKey.toUpperCase()}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- we know `modeValueKey` is a key of `modeValue`
        const colorVal = (modeValue as any)[modeValueKey];
        const multiplier = modeValueKey === "a" ? 1 : 255; // The `a` value is for opacity, we want that to be 1 or lower
        const colorValAsRGBA = parseFloat(colorVal) * multiplier;
        const roundedRGBAVal = parseInt(colorValAsRGBA.toString());
        formattedModeValueObject[formattedKey] = roundedRGBAVal.toString();
      });

      modeMapToReturn = { ...modeMapToReturn, ...formattedModeValueObject };
    }
  });

  return modeMapToReturn as Record<string, string>;
}

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

/**
 * Replace the keys of `variables` that show up in `inputString` (within `${}`) with
 * the key's value from the `variables` object.
 */
function insertVariables(
  inputString: string,
  variables: Record<string, string>
) {
  // replace the placeholders in the input string
  return inputString.replace(/\$\{([^}]+)\}/g, (match, variableName) => {
    // check if the variable exists in the provided variables object
    if (Object.prototype.hasOwnProperty.call(variables, variableName)) {
      return variables[variableName];
    } else {
      // if the variable is not found, return the original placeholder
      return match;
    }
  });
}

/** Load collections and post message with collections data. */
async function postCollections() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionNames = collections.map((collection) => ({
    name: collection.name,
    id: collection.id,
  }));

  figma.ui.postMessage({
    type: "collections-loaded",
    collections: collectionNames,
  });
}

/** Gets the fields that are available to use in the formatting string and posts a message with them. */
async function postCollectionVariableFormattingData(collectionId: string) {
  const collection = await figma.variables.getVariableCollectionByIdAsync(
    collectionId
  );

  if (!collection) return;

  const collectionFirstVariableId = collection.variableIds[0];
  const collectionVariable = await figma.variables.getVariableByIdAsync(
    collectionFirstVariableId
  );
  const collectionType = collectionVariable?.resolvedType;

  const formattingVars = [`${toCamelCase(collection.name)}VarName`];
  if (collectionType === "COLOR") {
    collection.modes.forEach((mode) => {
      // Look into making this more dynamic
      ["R", "G", "B", "A"].forEach((rgbaVal) =>
        formattingVars.push(`${mode.name}-${rgbaVal}`)
      );
    });
  } else {
    collection.modes.forEach((mode) => formattingVars.push(mode.name));
  }

  figma.ui.postMessage({
    type: "collection-vars-loaded",
    formattingVars,
  });
}
