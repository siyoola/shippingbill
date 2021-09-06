import { parse } from "svg-parser";
import QRCode from "@schoero/qrcode";
import ExtendedPDF from "./extended-pdf";
import * as utils from "./utils";

export interface data {
  currency: currency,
  creditor: creditor,
  debtor?: debtor,
  debitor?: debtor,
  amount?: number,
  reference?: string,
  message?: string,
  additionalInformation?: string,
  av1?: string,
  av2?: string
}

export interface debtor {
  name: string,
  address: string,
  zip: string | number,
  city: string,
  country: string
  houseNumber?: string | number
}

export interface creditor extends debtor {
  account: string,
}

export interface options {
  language?: languages,
  size?: size,
  scissors?: boolean,
  separate?: boolean,
  outlines?: boolean
  autoGenerate?: boolean,
}

export import PDFTable = ExtendedPDF.PDFTable;
export import PDFRow = ExtendedPDF.PDFRow;
export import PDFColumn = ExtendedPDF.PDFColumn;

export type currency = "CHF" | "EUR";
export type size = "A4" | "A6/5";
export type languages = "DE" | "EN" | "IT" | "FR";

export import utils = utils;

export class PDF extends ExtendedPDF.PDF {

  public size: size = "A6/5";
  private _data: data;
  private _scissors: boolean = true;
  private _separate: boolean = false;
  private _outlines: boolean = true;
  private _language: languages = "DE";
  private _marginTop: number = 0;
  private _autoGenerate: boolean = true;
  private _referenceType: "QRR" | "SCOR" | "NON" = "NON";

  static translations = {

    DE: {
      paymentPart: "جزئية الدفع",
      account: "الحساب / مدفوع الى",
      reference: "الاشاري",
      additionalInformation: "معلومات اضافية",
      currency: "العملة",
      amount: "الاجمالي",
      receipt: "المستلم",
      acceptancePoint: "مكان الاستلام",
      separate: "",
      payableBy: "مدفوع من",
      payableByName: "مدفوع من (الاسم\العنوان",
      inFavourOf: "بالنيابة عن"
    },
    EN: {
      paymentPart: "Payment part",
      account: "Account / Payable to",
      reference: "Reference",
      additionalInformation: "Additional information",
      currency: "Currency",
      amount: "Amount",
      receipt: "Receipt",
      acceptancePoint: "Acceptance point",
      separate: "Separate before paying in",
      payableBy: "Payable by",
      payableByName: "Payable by (name/address)",
      inFavourOf: "In favour of"
    },
    IT: {
      paymentPart: "Sezione pagamento",
      account: "Conto / Pagabile a",
      reference: "Riferimento",
      additionalInformation: "Informazioni supplementari",
      currency: "Valuta",
      amount: "Importo",
      receipt: "Ricevuta",
      acceptancePoint: "Punto di accettazione",
      separate: "Da staccare prima del versamento",
      payableBy: "Pagabile da",
      payableByName: "Pagabile da (nome/indirizzo)",
      inFavourOf: "A favore di"
    },
    FR: {
      paymentPart: "Section paiement",
      account: "Compte / Payable à",
      reference: "Référence",
      additionalInformation: "Informations supplémentaires",
      currency: "Monnaie",
      amount: "Montant",
      receipt: "Récépissé",
      acceptancePoint: "Point de dépôt",
      separate: "A détacher avant le versement",
      payableBy: "Payable par",
      payableByName: "Payable par (nom/adresse)",
      inFavourOf: "En faveur de"
    }
  }


  constructor(data: data, options?: options) {

    super({ autoFirstPage: false, bufferPages: true });

    this._data = data;

    if(this._data.debtor === undefined && this._data.debitor !== undefined){
      this._data.debtor = this._data.debitor;
    }

    this._cleanData();
    this._validateData();


    //-- Validate reference

    if(utils.isQRIBAN(this._data.creditor.account)){
      if(this._data.reference !== undefined){
        if(utils.isQRReference(this._data.reference)){
          this._referenceType = "QRR";
        }
      }
    } else {

      if(this._data.reference === undefined){
        this._referenceType = "NON";
      } else {
        if(!utils.isQRReference(this._data.reference)){
          this._referenceType = "SCOR";
        }
      }

    }


    //-- Apply options

    if(options !== undefined){
      if(options.language !== undefined){
        this._language = options.language;
      }
      if(options.size !== undefined){
        this.size = options.size;
      }
      if(options.scissors !== undefined){
        this._scissors = options.scissors;
        this._separate = !options.scissors;
      }
      if(options.separate !== undefined){
        this._separate = options.separate;
        this._scissors = !options.separate;
      }
      if(options.scissors === false && options.separate === false){
        this._separate = false;
        this._scissors = false;
      }
      if(options.outlines !== undefined){
        this._outlines = options.outlines;
      }
      if(options.autoGenerate !== undefined){
        this._autoGenerate = options.autoGenerate;
      }
    }

    this.info.Producer = this.info.Creator = this.info.Author = "SwissQRBill";

    this.addPage();

    if(this._autoGenerate === true){
      this.addQRBill();
      this.end();
    }

  }


  public addPage(options?: PDFKit.PDFDocumentOptions): PDFKit.PDFDocument {

    if(options === undefined){
      options = {
        margin: utils.mmToPoints(5),
        layout: this.size === "A4" ? "portrait" : "landscape",
        size: this.size === "A4" ? this.size : [utils.mmToPoints(105), utils.mmToPoints(210)]
      };
    }

    return super.addPage(options);

  }


  public end(): void {
    this.emit("beforeEnd", this);
    return super.end();
  }


  public addQRBill(size: size = "A6/5"): void {

    if(this.page.height - this.y < utils.mmToPoints(105) && this.y !== this.page.margins.top){
      this.addPage({
        margin: 0,
        layout: size === "A4" ? "portrait" : "landscape",
        size: size === "A4" ? size : [utils.mmToPoints(105), utils.mmToPoints(210)]
      });
    }

    this._marginTop = this.page.height - utils.mmToPoints(105);

    this._drawOutlines();
    this._drawReceipt();
    this._drawPaymentPart();

  }


  private _drawOutlines(): void {


    //-- Lines

    if(this._outlines === true){


      //-- Horizontal line

      if(this.page.height > utils.mmToPoints(105)){

        this.moveTo(0, this._marginTop)
          .lineTo(utils.mmToPoints(210), this._marginTop)
          .lineWidth(.75)
          .strokeOpacity(1)
          .dash(1, { size: 1 })
          .strokeColor("black")
          .stroke();

      }


      //-- Vertical line

      this.moveTo(utils.mmToPoints(62), this._marginTop)
        .lineTo(utils.mmToPoints(62), this._marginTop + utils.mmToPoints(105))
        .lineWidth(.75)
        .strokeOpacity(1)
        .dash(1, { size: 1 })
        .strokeColor("black")
        .stroke();

    }


    //-- Scissors

    if(this._scissors === true){

      const scissorsTop = "M4.545 -1.803C4.06 -2.388 3.185 -2.368 2.531 -2.116l-4.106 1.539c-1.194 -0.653 -2.374 -0.466 -2.374 -0.784c0 -0.249 0.228 -0.194 0.194 -0.842c-0.033 -0.622 -0.682 -1.082 -1.295 -1.041c-0.614 -0.004 -1.25 0.467 -1.255 1.115c-0.046 0.653 0.504 1.26 1.153 1.303c0.761 0.113 2.109 -0.348 2.741 0.785c-0.471 0.869 -1.307 0.872 -2.063 0.828c-0.627 -0.036 -1.381 0.144 -1.68 0.76c-0.289 0.591 -0.006 1.432 0.658 1.613c0.67 0.246 1.59 -0.065 1.75 -0.835c0.123 -0.594 -0.298 -0.873 -0.136 -1.089c0.122 -0.163 0.895 -0.068 2.274 -0.687L2.838 2.117C3.4 2.273 4.087 2.268 4.584 1.716L-0.026 -0.027L4.545 -1.803zm-9.154 -0.95c0.647 0.361 0.594 1.342 -0.078 1.532c-0.608 0.212 -1.386 -0.379 -1.192 -1.039c0.114 -0.541 0.827 -0.74 1.27 -0.493zm0.028 4.009c0.675 0.249 0.561 1.392 -0.126 1.546c-0.456 0.158 -1.107 -0.069 -1.153 -0.606c-0.089 -0.653 0.678 -1.242 1.279 -0.94z";
      const scissorsCenter = "M1.803 4.545C2.388 4.06 2.368 3.185 2.116 2.531l-1.539 -4.106c0.653 -1.194 0.466 -2.374 0.784 -2.374c0.249 0 0.194 0.228 0.842 0.194c0.622 -0.033 1.082 -0.682 1.041 -1.295c0.004 -0.614 -0.467 -1.25 -1.115 -1.255c-0.653 -0.046 -1.26 0.504 -1.303 1.153c-0.113 0.761 0.348 2.109 -0.785 2.741c-0.869 -0.471 -0.872 -1.307 -0.828 -2.063c0.036 -0.627 -0.144 -1.381 -0.76 -1.68c-0.591 -0.289 -1.432 -0.006 -1.613 0.658c-0.246 0.67 0.065 1.59 0.835 1.75c0.594 0.123 0.873 -0.298 1.089 -0.136c0.163 0.122 0.068 0.895 0.687 2.274L-2.117 2.838C-2.273 3.4 -2.268 4.087 -1.716 4.584L0.027 -0.026L1.803 4.545zm0.95 -9.154c-0.361 0.647 -1.342 0.594 -1.532 -0.078c-0.212 -0.608 0.379 -1.386 1.039 -1.192c0.541 0.114 0.74 0.827 0.493 1.27zm-4.009 0.028c-0.249 0.675 -1.392 0.561 -1.546 -0.126c-0.158 -0.456 0.069 -1.107 0.606 -1.153c0.653 -0.089 1.242 0.678 0.94 1.279z";

      if(this.page.height > utils.mmToPoints(105)){

        this.addPath(scissorsTop, utils.mmToPoints(105), this._marginTop)
          .fillColor("black")
          .fill();

      }

      this.addPath(scissorsCenter, utils.mmToPoints(62), this._marginTop + 30)
        .fillColor("black")
        .fill();
      this.translate(0, 0);

    }


    //-- Separation text

    if(this._separate === true){

      if(this.page.height > utils.mmToPoints(105)){

        this.fontSize(11);
        this.font("Helvetica");
        this.text(PDF.translations[this._language].separate, utils.mmToPoints(0), this._marginTop - 12, {
          width: utils.mmToPoints(210),
          align: "center"
        });

      }

    }

  }


  private _drawReceipt(): void {

    this.fontSize(11);
    this.font("Helvetica-Bold");
    this.text(PDF.translations[this._language].receipt, utils.mmToPoints(5), this._marginTop + utils.mmToPoints(5), {
      width: utils.mmToPoints(52),
      align: "left"
    });

    this.fontSize(6);
    this.font("Helvetica-Bold");
    this.text(PDF.translations[this._language].account, utils.mmToPoints(5), this._marginTop + utils.mmToPoints(12), {
      width: utils.mmToPoints(52)
    });


    //-- Creditor

    this.fontSize(8);
    this.font("Helvetica");
    this.text(`${utils.formatIBAN(this._data.creditor.account)}\n${this._formatAddress(this._data.creditor)}`, {
      width: utils.mmToPoints(52)
    });

    this.moveDown();


    //-- Reference

    if(this._data.reference !== undefined){

      this.fontSize(6);
      this.font("Helvetica-Bold");
      this.text(PDF.translations[this._language].reference, {
        width: utils.mmToPoints(52)
      });

      this.fontSize(8);
      this.font("Helvetica");
      this.text(this._formatReference(this._data.reference), {
        width: utils.mmToPoints(52)
      });

    }


    //-- Debtor

    if(this._data.debtor !== undefined){

      this.fontSize(9);
      this.moveDown();

      this.fontSize(6);
      this.font("Helvetica-Bold");
      this.text(PDF.translations[this._language].payableBy, {
        width: utils.mmToPoints(52)
      });

      this.fontSize(8);
      this.font("Helvetica");
      this.text(this._formatAddress(this._data.debtor), {
        width: utils.mmToPoints(52)
      });

    } else {

      this.fontSize(9);
      this.moveDown();

      this.fontSize(6);
      this.font("Helvetica-Bold");
      this.text(PDF.translations[this._language].payableByName, {
        width: utils.mmToPoints(52)
      });


      //-- Draw rectangle

      const posY = this._data.reference === undefined ? 38 : 43;

      this._drawRectangle(5, posY, 52, 20);

    }

    this.fontSize(6);
    this.font("Helvetica-Bold");
    this.text(PDF.translations[this._language].currency, utils.mmToPoints(5), this._marginTop + utils.mmToPoints(68), {
      width: utils.mmToPoints(15)
    });

    this.text(PDF.translations[this._language].amount, utils.mmToPoints(20), this._marginTop + utils.mmToPoints(68), {
      width: utils.mmToPoints(37)
    });

    this.fontSize(8);
    this.font("Helvetica");
    this.text(this._data.currency, utils.mmToPoints(5), this._marginTop + utils.mmToPoints(71), {
      width: utils.mmToPoints(15)
    });

    if(this._data.amount !== undefined){
      this.text(utils.formatAmount(this._data.amount), utils.mmToPoints(20), this._marginTop + utils.mmToPoints(71), {
        width: utils.mmToPoints(37)
      });
    } else {
      this._drawRectangle(30, 68, 30, 10);
    }

    this.fontSize(6);
    this.font("Helvetica-Bold");
    this.text(PDF.translations[this._language].acceptancePoint, utils.mmToPoints(5), this._marginTop + utils.mmToPoints(82), {
      width: utils.mmToPoints(52),
      align: "right"
    });

  }


  private _drawPaymentPart(): void {

    this.fontSize(11);
    this.font("Helvetica-Bold");
    this.text(PDF.translations[this._language].paymentPart, utils.mmToPoints(67), this._marginTop + utils.mmToPoints(5), {
      width: utils.mmToPoints(51),
      align: "left"
    });

    this._generateQRCode();

    this.fillColor("black");

    this.fontSize(8);
    this.font("Helvetica-Bold");
    this.text(PDF.translations[this._language].currency, utils.mmToPoints(67), this._marginTop + utils.mmToPoints(68), {
      width: utils.mmToPoints(15)
    });

    this.text(PDF.translations[this._language].amount, utils.mmToPoints(87), this._marginTop + utils.mmToPoints(68), {
      width: utils.mmToPoints(36)
    });

    this.fontSize(10);
    this.font("Helvetica");
    this.text(this._data.currency, utils.mmToPoints(67), this._marginTop + utils.mmToPoints(72), {
      width: utils.mmToPoints(15)
    });

    if(this._data.amount !== undefined){
      this.text(utils.formatAmount(this._data.amount), utils.mmToPoints(87), this._marginTop + utils.mmToPoints(72), {
        width: utils.mmToPoints(36)
      });
    } else {
      this._drawRectangle(80, 72, 40, 15);
    }


    //-- AV1 and AV2

    if(this._data.av1 !== undefined){
      this.fontSize(7);
      this.font("Helvetica-Bold");
      this.text("Name AV1:", utils.mmToPoints(67), this._marginTop + utils.mmToPoints(90), {
        width: utils.mmToPoints(15)
      });

      this.fontSize(7);
      this.font("Helvetica");
      this.text((this._data.av1.length > 87 ? this._data.av1.substr(0, 87) + "..." : this._data.av1), utils.mmToPoints(81), this._marginTop + utils.mmToPoints(90), {
        width: utils.mmToPoints(37)
      });
    }

    if(this._data.av2 !== undefined){
      this.fontSize(7);
      this.font("Helvetica-Bold");
      this.text("Name AV2:", utils.mmToPoints(67), this._marginTop + utils.mmToPoints(93), {
        width: utils.mmToPoints(15)
      });

      this.fontSize(7);
      this.font("Helvetica");
      this.text((this._data.av2.length > 87 ? this._data.av2.substr(0, 87) + "..." : this._data.av2), utils.mmToPoints(81), this._marginTop + utils.mmToPoints(93), {
        width: utils.mmToPoints(37)
      });
    }

    this.fontSize(8);
    this.font("Helvetica-Bold");
    this.text(PDF.translations[this._language].account, utils.mmToPoints(118), this._marginTop + utils.mmToPoints(5), {
      width: utils.mmToPoints(87)
    });

    this.fontSize(10);
    this.font("Helvetica");
    this.text(`${utils.formatIBAN(this._data.creditor.account)}\n${this._formatAddress(this._data.creditor)}`, utils.mmToPoints(118), this._marginTop + utils.mmToPoints(9.5), {
      width: utils.mmToPoints(87)
    });

    this.moveDown();

    if(this._data.reference !== undefined){

      this.fontSize(8);
      this.font("Helvetica-Bold");
      this.text(PDF.translations[this._language].reference, {
        width: utils.mmToPoints(87)
      });

      this.fontSize(10);
      this.font("Helvetica");
      this.text(this._formatReference(this._data.reference), {
        width: utils.mmToPoints(87)
      });

      this.moveDown();

    }


    //-- Message / Additional information

    if(this._data.message !== undefined || this._data.additionalInformation !== undefined){

      this.fontSize(8);
      this.font("Helvetica-Bold");
      this.text(PDF.translations[this._language].additionalInformation, {
        width: utils.mmToPoints(87)
      });

      this.fontSize(10);
      this.font("Helvetica");

      const options = {
        width: utils.mmToPoints(87)
      };

      const singleLineHeight = this.heightOfString("A", options);
      const maxLines = this._referenceType === "QRR" || this._referenceType === "SCOR" ? 3 : 4;
      const linesOfMessage = this._data.message !== undefined ? this.heightOfString(this._data.message, options) / singleLineHeight : 0;
      const linesOfAdditionalInformation = this._data.additionalInformation !== undefined ? this.heightOfString(this._data.additionalInformation, options) / singleLineHeight : 0;

      if(this._data.additionalInformation !== undefined){

        if(this._referenceType === "QRR" || this._referenceType === "SCOR"){

          // QRR and SCOR have 1 line for the message and 2 lines for the additional information

          if(this._data.message !== undefined){
            this.text(this._data.message, { ...options, lineBreak: false, ellipsis: true, height: singleLineHeight });
          }

        } else {

          // Non QRR and SCOR have 4 lines total available and the message should be shortened if necessary

          if(this._data.message !== undefined){
            if(linesOfMessage + linesOfAdditionalInformation > maxLines){
              const maxLinesOfMessage = maxLines - linesOfAdditionalInformation;
              this.text(this._data.message, { ...options, height: singleLineHeight * maxLinesOfMessage, lineBreak: true, ellipsis: true });
            }
          }

        }

        this.text(this._data.additionalInformation, options);

      } else if(this._data.message !== undefined){
        this.text(this._data.message, { ...options, height: singleLineHeight * maxLines, lineBreak: true, ellipsis: true });
      }

      this.moveDown();

    }

    if(this._data.debtor !== undefined){

      this.fontSize(8);
      this.font("Helvetica-Bold");
      this.text(PDF.translations[this._language].payableBy, {
        width: utils.mmToPoints(87)
      });

      this.fontSize(10);
      this.font("Helvetica");
      this.text(this._formatAddress(this._data.debtor), {
        width: utils.mmToPoints(87)
      });

    } else {

      this.fontSize(8);
      this.font("Helvetica-Bold");
      this.text(PDF.translations[this._language].payableByName, {
        width: utils.mmToPoints(87)
      });

      const posY = this._data.reference === undefined ? 34 : 45;

      this._drawRectangle(118, posY, 65, 25);

    }
  }


  private _validateData(): void {


    //-- Creditor

    if(this._data.creditor === undefined){ throw new Error("Creditor cannot be undefined."); }


    //-- Creditor account

    if(this._data.creditor.account === undefined){
      throw new Error("You must provide an IBAN or QR-IBAN number.");
    }

    if(this._data.creditor.account.length !== 21){
      throw new Error(`The provided IBAN number '${this._data.creditor.account}' is either too long or too short.`);
    }

    if(utils.isIBANValid(this._data.creditor.account) === false){
      throw new Error(`The provided IBAN number '${this._data.creditor.account}' is not valid.`);
    }

    if(this._data.creditor.account.substr(0, 2) !== "CH" && this._data.creditor.account.substr(0, 2) !== "LI"){
      throw new Error("Only CH and LI IBAN numbers are allowed.");
    }


    //-- Validate reference

    if(utils.isQRIBAN(this._data.creditor.account)){

      if(this._data.reference === undefined){
        throw new Error("If there is no reference, a conventional IBAN must be used.");
      }

      if(utils.isQRReference(this._data.reference)){

        this._referenceType = "QRR";

        if(!utils.isQRReferenceValid(this._data.reference)){
          throw new Error("QR-Reference checksum is not valid.");
        }

      } else {
        throw new Error("QR-IBAN requires the use of a QR-Reference (and vice versa).");
      }

    } else {

      if(this._data.reference === undefined){
        this._referenceType = "NON";
      } else {
        if(utils.isQRReference(this._data.reference)){
          throw new Error("QR-Reference requires the use of a QR-IBAN (and vice versa).");
        } else {
          this._referenceType = "SCOR";
        }
      }

    }


    //-- Creditor name

    if(this._data.creditor.name === undefined){ throw new Error("Creditor name cannot be undefined."); }
    if(typeof this._data.creditor.name !== "string"){ throw new Error("Creditor name must be a string."); }
    if(this._data.creditor.name.length > 70){ throw new Error("Creditor name must be a maximum of 70 characters."); }


    //-- Creditor Address

    if(this._data.creditor.address === undefined){ throw new Error("Creditor address cannot be undefined."); }
    if(typeof this._data.creditor.address !== "string"){ throw new Error("Creditor address must be a string."); }
    if(this._data.creditor.address.length > 70){ throw new Error("Creditor address must be a maximum of 70 characters."); }


    //-- Creditor houseNumber

    if(this._data.creditor.houseNumber !== undefined){
      if(typeof this._data.creditor.houseNumber !== "string" && typeof this._data.creditor.houseNumber !== "number"){ throw new Error("Debtor houseNumber must be either a string or a number."); }
      if(this._data.creditor.houseNumber.toString().length > 16){ throw new Error("Creditor houseNumber can be a maximum of 16 characters."); }
    }


    //-- Creditor Zip

    if(this._data.creditor.zip === undefined){ throw new Error("Creditor zip cannot be undefined."); }
    if(typeof this._data.creditor.zip !== "string" && typeof this._data.creditor.zip !== "number"){ throw new Error("Creditor zip must be either a string or a number."); }
    if(this._data.creditor.zip.toString().length > 16){ throw new Error("Creditor zip must be a maximum of 16 characters."); }


    //-- Creditor city

    if(this._data.creditor.city === undefined){ throw new Error("Creditor city cannot be undefined."); }
    if(typeof this._data.creditor.city !== "string"){ throw new Error("Creditor city must be a string."); }
    if(this._data.creditor.city.length > 35){ throw new Error("Creditor city must be a maximum of 35 characters."); }


    //-- Creditor country

    if(this._data.creditor.country === undefined){ throw new Error("Creditor country cannot be undefined."); }
    if(typeof this._data.creditor.country !== "string"){ throw new Error("Creditor country must be a string."); }
    if(this._data.creditor.country.length !== 2){ throw new Error("Creditor country must be 2 characters."); }


    //-- Amount

    if(this._data.amount !== undefined){
      if(typeof this._data.amount !== "number"){ throw new Error("Amount must be a number."); }
      if(this._data.amount.toFixed(2).toString().length > 12){ throw new Error("Amount must be a maximum of 12 digits."); }
    }


    //-- Currency

    if(this._data.currency === undefined){ throw new Error("Currency cannot be undefined."); }
    if(typeof this._data.currency !== "string"){ throw new Error("Currency must be a string."); }
    if(this._data.currency.length !== 3){ throw new Error("Currency must be a length of 3 characters."); }
    if(this._data.currency !== "CHF" && this._data.currency !== "EUR"){ throw new Error("Currency must be either 'CHF' or 'EUR'"); }


    //-- Debtor

    if(this._data.debtor !== undefined){


      //-- Debtor name

      if(this._data.debtor.name === undefined){ throw new Error("Debtor name cannot be undefined if the debtor object is available."); }
      if(typeof this._data.debtor.name !== "string"){ throw new Error("Debtor name must be a string."); }
      if(this._data.debtor.name.length > 70){ throw new Error("Debtor name must be a maximum of 70 characters."); }


      //-- Debtor address

      if(this._data.debtor.address === undefined){ throw new Error("Debtor address cannot be undefined if the debtor object is available."); }
      if(typeof this._data.debtor.address !== "string"){ throw new Error("Debtor address must be a string."); }
      if(this._data.debtor.address.length > 70){ throw new Error("Debtor address must be a maximum of 70 characters."); }


      //-- Debtor houseNumber

      if(this._data.debtor.houseNumber !== undefined){
        if(typeof this._data.debtor.houseNumber !== "string" && typeof this._data.debtor.houseNumber !== "number"){ throw new Error("Debtor house number must be either a string or a number."); }
        if(this._data.debtor.houseNumber.toString().length > 16){ throw new Error("Debtor house number can be a maximum of 16 characters."); }
      }


      //-- Debtor zip

      if(this._data.debtor.zip === undefined){ throw new Error("Debtor zip cannot be undefined if the debtor object is available."); }
      if(typeof this._data.debtor.zip !== "string" && typeof this._data.debtor.zip !== "number"){ throw new Error("Debtor zip must be either a string or a number."); }
      if(this._data.debtor.zip.toString().length > 16){ throw new Error("Debtor zip must be a maximum of 16 characters."); }


      //-- Debtor city

      if(this._data.debtor.city === undefined){ throw new Error("Debtor city cannot be undefined if the debtor object is available."); }
      if(typeof this._data.debtor.city !== "string"){ throw new Error("Debtor city must be a string."); }
      if(this._data.debtor.city.length > 35){ throw new Error("Debtor city must be a maximum of 35 characters."); }


      //-- Debtor country

      if(this._data.debtor.country === undefined){ throw new Error("Debtor country cannot be undefined if the debtor object is available."); }
      if(typeof this._data.debtor.country !== "string"){ throw new Error("Debtor country must be a string."); }
      if((this._data.debtor.country).length !== 2){ throw new Error("Debtor country must be 2 characters."); }

    }


    //-- Reference

    if(this._data.reference !== undefined){
      if(typeof this._data.reference !== "string"){ throw new Error("Reference name must be a string."); }
      if(this._data.reference.length > 27){ throw new Error("Reference name must be a maximum of 27 characters."); }
    }


    //-- Message

    if(this._data.message !== undefined){
      if(this._data.message.length > 140){ throw new Error("Message must be a maximum of 140 characters."); }
      if(typeof this._data.message !== "string"){ throw new Error("Message must be a string."); }
    }


    //-- Additional information

    if(this._data.additionalInformation !== undefined){
      if(this._data.additionalInformation.length > 140){ throw new Error("AdditionalInformation must be a maximum of 140 characters."); }
      if(typeof this._data.additionalInformation !== "string"){ throw new Error("AdditionalInformation must be a string."); }
    }


    //-- Message + Additional information

    if(this._data.message !== undefined && this._data.additionalInformation !== undefined){
      if(this._data.additionalInformation.length + this._data.message.length > 140){ throw new Error("Message and additionalInformation combined must be a maximum of 140 characters."); }
    }


    //-- AV1

    if(this._data.av1 !== undefined){
      if(this._data.av1.length > 100){ throw new Error("AV1 must be a maximum of 100 characters."); }
      if(typeof this._data.av1 !== "string"){ throw new Error("AV1 must be a string."); }
      if(this._data.av1.substr(0, 5) !== "eBill"){
        throw new Error("AV1 must begin with eBill");
      }
    }


    //-- AV2

    if(this._data.av2 !== undefined){
      if(this._data.av2.length > 100){ throw new Error("AV2 must be a maximum of 100 characters."); }
      if(typeof this._data.av2 !== "string"){ throw new Error("AV2 must be a string."); }
      if(this._data.av2.substr(0, 5) !== "eBill"){
        throw new Error("AV2 must begin with eBill");
      }
    }

  }


  private _generateQRCode(): void {

    let qrString = "";


    //-- Swiss Payments Code

    qrString += "SPC";


    //-- Version

    qrString += "\n0200";


    //-- Coding Type UTF-8

    qrString += "\n1";


    //-- IBAN

    qrString += "\n" + this._data.creditor.account ?? "\n";


    //-- Creditor

    if(this._data.creditor.houseNumber !== undefined){

      // Address Type
      qrString += "\nS";

      // Name
      qrString += "\n" + this._data.creditor.name;

      // Address
      qrString += "\n" + this._data.creditor.address;

      // House number
      qrString += "\n" + this._data.creditor.houseNumber;

      // Zip
      qrString += "\n" + this._data.creditor.zip;

      // City
      qrString += "\n" + this._data.creditor.city;

    } else {

      // Address Type
      qrString += "\nK";

      // Name
      qrString += "\n" + this._data.creditor.name;

      // Address
      qrString += "\n" + this._data.creditor.address;

      // Zip + city
      if((this._data.creditor.zip + " " + this._data.creditor.city).length > 70){ throw new Error("Creditor zip plus city must be a maximum of 70 characters."); }
      qrString += "\n" + this._data.creditor.zip + " " + this._data.creditor.city;

      // Empty zip field
      qrString += "\n";

      // Empty city field
      qrString += "\n";

    }

    qrString += "\n" + this._data.creditor.country;


    //-- 7 x empty

    qrString += "\n"; // 1
    qrString += "\n"; // 2
    qrString += "\n"; // 3
    qrString += "\n"; // 4
    qrString += "\n"; // 5
    qrString += "\n"; // 6
    qrString += "\n"; // 7


    //-- Amount

    if(this._data.amount !== undefined){
      qrString += "\n" + this._data.amount.toFixed(2);
    } else {
      qrString += "\n";
    }


    //-- Currency

    qrString += "\n" + this._data.currency;


    //-- Debtor

    if(this._data.debtor !== undefined){
      if(this._data.debtor.houseNumber !== undefined){

        // Address type
        qrString += "\nS";

        // Name
        qrString += "\n" + this._data.debtor.name;

        // Address
        qrString += "\n" + this._data.debtor.address;

        // House number
        qrString += "\n" + this._data.debtor.houseNumber;

        // Zip
        qrString += "\n" + this._data.debtor.zip;

        // City
        qrString += "\n" + this._data.debtor.city;

      } else {

        // Address type
        qrString += "\nK";

        // Name
        qrString += "\n" + this._data.debtor.name;

        // Address
        qrString += "\n" + this._data.debtor.address;

        // Zip + city
        if((this._data.debtor.zip + " " + this._data.debtor.city).length > 70){ throw new Error("Debtor zip plus city must be a maximum of 70 characters."); }
        qrString += "\n" + this._data.debtor.zip + " " + this._data.debtor.city;

        // Empty field zip
        qrString += "\n";

        // Empty field city
        qrString += "\n";

      }

      // Country
      qrString += "\n" + this._data.debtor.country;

    } else {


      // Empty field type
      qrString += "\n";

      // Empty field name
      qrString += "\n";

      // Empty field address
      qrString += "\n";

      // Empty field house number
      qrString += "\n";

      // Empty field zip
      qrString += "\n";

      // Empty field city
      qrString += "\n";

      // Empty field country
      qrString += "\n";

    }


    //-- Reference type

    qrString += "\n" + this._referenceType;


    //-- Reference

    if(this._data.reference !== undefined){
      qrString += "\n" + this._data.reference;
    } else {
      qrString += "\n";
    }


    //-- Unstructured message

    if(this._data.message !== undefined){
      qrString += "\n" + this._data.message;
    } else {
      qrString += "\n";
    }


    //-- End Payment Data

    qrString += "\n" + "EPD";


    //-- Additional information

    if(this._data.additionalInformation !== undefined){
      qrString += "\n" + this._data.additionalInformation;
    } else {
      qrString += "\n";
    }


    //-- AV1

    if(this._data.av1 !== undefined){
      qrString += "\n" + this._data.av1;
    }

    if(this._data.av2 !== undefined){
      qrString += "\n" + this._data.av2;
    }


    //-- Create QR Code

    const qrcodeString = QRCode.toString(qrString, {
      type: "svg",
      width: utils.mmToPoints(46),
      margin: 0,
      errorCorrectionLevel: "M"
    }, () => { }) as unknown as string;

    const svgPath = this._getSVGPathFromQRCodeString(qrcodeString);

    if(svgPath === undefined){
      throw new Error("Could not convert svg image to path");
    }

    this.moveTo(utils.mmToPoints(67), this._marginTop + utils.mmToPoints(17));

    this.addPath(svgPath, utils.mmToPoints(67), this._marginTop + utils.mmToPoints(17))
      .undash()
      .fillColor("black")
      .fill();


    //-- Black rectangle

    const background = "M18.3 0.7L1.6 0.7 0.7 0.7 0.7 1.6 0.7 18.3 0.7 19.1 1.6 19.1 18.3 19.1 19.1 19.1 19.1 18.3 19.1 1.6 19.1 0.7Z";
    const cross = "M8.3 4H11.6V15H8.3V4Z M4.4 7.9H15.4V11.2H4.4V7.9Z";

    this.addPath(background, utils.mmToPoints(86), this._marginTop + utils.mmToPoints(36))
      .fillColor("black")
      .lineWidth(1.4357)
      .strokeColor("white")
      .fillAndStroke();

    this.addPath(cross, utils.mmToPoints(86), this._marginTop + utils.mmToPoints(36))
      .fillColor("white")
      .fill();

  }


  private _getSVGPathFromQRCodeString(qrcodeString: string): string | undefined {

    const svgObject = parse(qrcodeString);

    if(svgObject.children === undefined){
      return;
    }

    firstChildLoop: for(const firstChild of svgObject.children){

      if(firstChild.type !== "element"){
        continue firstChildLoop;
      }

      secondChildLoop: for(const secondChild of firstChild.children){

        if(typeof secondChild !== "object"){
          continue secondChildLoop;
        }
        if(secondChild.type !== "element"){
          continue secondChildLoop;
        }
        if(secondChild.properties === undefined){
          continue secondChildLoop;
        }
        if(secondChild.properties.fill !== "#000000"){
          continue;
        }
        if(secondChild.properties.d === undefined){
          continue secondChildLoop;
        }
        if(typeof secondChild.properties.d !== "string"){
          continue secondChildLoop;
        }

        return secondChild.properties.d;

      }

    }

  }


  public mmToPoints(mm: number): number {
    return utils.mmToPoints(mm);
  }


  private _formatAddress(data: debtor | creditor): string {
    if(data.houseNumber !== undefined){
      return `${data.name}\n${data.address} ${data.houseNumber}\n${data.zip} ${data.city}`;
    } else {
      return `${data.name}\n${data.address}\n${data.zip} ${data.city}`;
    }
  }


  private _cleanData(): void {

    const _cleanObject = (object: object): void => {

      const keys = Object.keys(object);

      for(let k = 0; k < keys.length; k++){
        if(typeof object[keys[k]] === "string"){

          object[keys[k]] = this._removeLinebreaks(object[keys[k]]);

          if(keys[k] === "account"){
            object[keys[k]] = object[keys[k]].replace(/ /g, "");
          }
          if(keys[k] === "reference"){
            object[keys[k]] = object[keys[k]].replace(/ /g, "");
          }

        } else {
          if(typeof object[keys[k]] === "object"){
            _cleanObject(object[keys[k]]);
          }
        }
      }
    };

    _cleanObject(this._data);

  }


  private _removeLinebreaks(data: string): string {
    return data.replace(/\n/g, "").replace(/\r/g, "");
  }


  private _formatReference(reference: string): string {
    if(this._referenceType === "QRR"){
      return utils.formatQRReference(reference);
    } else if(this._referenceType === "SCOR"){
      return utils.formatSCORReference(reference);
    }
    return reference;
  }


  private _drawRectangle(x: number, y: number, width: number, height: number): void {

    const length = 3;

    this.moveTo(utils.mmToPoints(x + length), this._marginTop + utils.mmToPoints(y))
      .lineTo(utils.mmToPoints(x), this._marginTop + utils.mmToPoints(y))
      .lineTo(utils.mmToPoints(x), this._marginTop + utils.mmToPoints(y + length))
      .moveTo(utils.mmToPoints(x), this._marginTop + utils.mmToPoints(y + height - length))
      .lineTo(utils.mmToPoints(x), this._marginTop + utils.mmToPoints(y + height))
      .lineTo(utils.mmToPoints(x + length), this._marginTop + utils.mmToPoints(y + height))
      .moveTo(utils.mmToPoints(x + width - length), this._marginTop + utils.mmToPoints(y + height))
      .lineTo(utils.mmToPoints(x + width), this._marginTop + utils.mmToPoints(y + height))
      .lineTo(utils.mmToPoints(x + width), this._marginTop + utils.mmToPoints(y + height - length))
      .moveTo(utils.mmToPoints(x + width), this._marginTop + utils.mmToPoints(y + length))
      .lineTo(utils.mmToPoints(x + width), this._marginTop + utils.mmToPoints(y))
      .lineTo(utils.mmToPoints(x + width - length), this._marginTop + utils.mmToPoints(y))
      .lineWidth(.75)
      .undash()
      .strokeColor("black")
      .stroke();

  }

}
