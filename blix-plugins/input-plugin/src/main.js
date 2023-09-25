const nodes = {
    "number": (context) => {
        const nodeBuilder = context.instantiate("Input", "number");
        nodeBuilder.setTitle("Number");
        nodeBuilder.setDescription("Provides a number input and returns a single number output");

        nodeBuilder.define((input, uiInput, from) => {
            return { "res": uiInput["value"] };
        });

        const ui = nodeBuilder.createUIBuilder();
        ui
        .addSlider(
            {
                componentId: "value",
                label: "Input number",
                defaultValue: 0,
                triggerUpdate: true,
            },
            { min: 0, max: 100, set: 0.1 }
        );
        nodeBuilder.setUI(ui);

        nodeBuilder.addOutput("number", "res", "Result");
    },
    // "image": (context) => {
    //     const nodeBuilder = context.instantiate("Input", "image");
    //     nodeBuilder.setTitle("Image");
    //     nodeBuilder.setDescription("Provides an image input and returns a single image output");

    //     nodeBuilder.define((input, uiInput, from) => {
    //         return { "res": uiInput["imagePicker"]};
    //     });

    //     const ui = nodeBuilder.createUIBuilder();
    //     ui.addFilePicker({
    //         componentId: "imagePicker",
    //         label: "Pick an image",
    //         defaultValue: "",
    //         triggerUpdate: true,
    //     }, {});

    //     nodeBuilder.setUI(ui);

    //     nodeBuilder.addOutput("image", "res", "Result");
    // },
    // Will we define a color type? or just a vector4/string 
    "color": (context) => {
        const nodeBuilder = context.instantiate("Input", "color");
        nodeBuilder.setTitle("Color");
        nodeBuilder.setDescription("Provides a color input and returns a single color output");

        nodeBuilder.define((input, uiInput, from) => {
            return { "res": uiInput["colorPicker"]};
        });

        const ui = nodeBuilder.createUIBuilder();
        ui.addColorPicker({
            componentId: "colorPicker",
            label: "Pick a color",
            defaultValue: "#ff0000ff",
            triggerUpdate: true,
        }, {})
        nodeBuilder.setUI(ui);

        nodeBuilder.addOutput("color", "res", "Result");
    },
    "boolean": (context) => {
        const nodeBuilder = context.instantiate("Input", "boolean");
        nodeBuilder.setTitle("Boolean");
        nodeBuilder.setDescription("Provides a radio box to select a single true/false value");

        nodeBuilder.define((input, uiInput, from) => {
            return { "val": uiInput["radio"] === "true" };
        });

        const ui = nodeBuilder.createUIBuilder();
        ui.addRadio({
            componentId: "radio",
            label: "Boolean value",
            defaultValue: "false",
            triggerUpdate: true,
        }, {
          options: {
            "False": "false",
            "True": "true",
          }
        });
        nodeBuilder.setUI(ui);

        nodeBuilder.addOutput("boolean", "val", "Value");
    },
}

const commands = {}

const tiles = {}

module.exports = {
    nodes,
    commands,
    tiles
};