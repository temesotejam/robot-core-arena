# Robot Core Arena

ブラウザで遊ぶ3Dロボット対戦ゲームの試作版です。1対1から3対3まで、味方と敵の人数をそれぞれ選べます。

## 起動

Node.js 20以上で、以下を実行して http://localhost:4173 を開いてください。

```sh
npm run dev
```

実行時のパッケージインストールや外部CDNへのアクセスは不要です。Three.jsを同梱しています。WebGL対応のブラウザが必要です。

## 操作

| 操作 | キーボード・マウス | ゲームパッド |
|---|---|---|
| 移動 / 視点 | WASD / マウス | 左 / 右スティック |
| 攻撃 / チャージ | 左クリック / 長押し | Y / 長押し |
| ガード | 右クリック | LB |
| ジャンプ / ダッシュ | Space / Shift | B / A |
| 武器切り替え | Q | 十字キー上 |
| ロックオン | Tab | 十字キー下 |
| ターゲット切り替え | Z / C | 十字キー左右 |
| 視点リセット | R | X |
| 必殺技 | E | RB |
| 一時停止 | Esc | Start |

戦闘画面をクリックするとマウスの視点操作を開始します。近接攻撃は短いクリックを繰り返すとコンボになります。スマートフォンにはタッチ操作を表示します。

## 現在の内容

- 全9通りの人数設定、3ステージ、CPU難易度3段階、戦闘スタイル5種類。
- 5部位の装甲、19武器種、A・Bセット切り替え、盾。
- Lメイン46マスとMGサブ48マス、回転・移動・自動配置・操作の取り消し。
- 1機5枠のスキル、武器別76技の選択と使用。
- LP・テンション・BP・チャンス、弾数・リロード、状態異常、ロックオン。
- 戦闘報酬、同面積の形状違い、省スペース補助パーツ、所持数、保存構成。
- ブラウザ内の自動保存、JSONバックアップ、トレーニング。

確定仕様は [docs/SPECIFICATION.md](docs/SPECIFICATION.md)、暫定実装と制約は [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) に保存しています。原作のモデル・画像・音楽は使用していません。

## 検証

```sh
npm run check
npm test
node scripts/build.mjs
```

## GitHub Pages

リポジトリの Settings → Pages → Build and deployment → Source を **GitHub Actions** に設定すると、mainへのpushでチェックと公開が実行されます。

公開先予定: https://temesotejam.github.io/robot-core-arena/

初回にPagesが無効な場合は公開ジョブが失敗します。上記の設定後、Actionsから失敗したジョブを再実行してください。公開成功前のURLは404になります。

## ライセンス

同梱Three.jsはMITライセンスです。ライセンス全文は `vendor/THREE-LICENSE.txt` にあります。
