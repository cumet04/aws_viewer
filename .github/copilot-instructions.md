## 全般
* タスクを遂行するにあたり、必要な情報が不足していれば、質問をしてください。
* すべての返答は日本語で行ってください。
* 既存コードにあるlintやformatのignoreコメントは修正しないでください。

## TypeScriptのコードの書き方
* 変数や引数にはanyやunknownではない具体的な型を指定してください
* letやvarではなくconstを使用できるようなコードにしてください。またArrayに対するpushやpopなどの変更を伴うメソッドの仕様も避けてください
* AWS SDKが提供する型に起因する属性がoptionalかつ xx|undefined である場合、その値の利用先では積極的に attribute! を使用してoptional成分を排除してください

## React Routerのコードの書き方
* loaderからコンポーネントに渡すpropsの型には、AWS SDKが提供する型をそのまま使わず、必要な属性のみを抽出して型定義してください

## AWS SDKのコードの書き方
* paginate系のメソッドを使用する場合は、paginatorを使用してください
* API戻り値に対しては、SDKで定義されている型を使用してください
