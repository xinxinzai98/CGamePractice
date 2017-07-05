# 函数命名规则：
- 1、望文生义，通过函数名称了解函数功能；
- 2、函数名称中，除名称首字母外，每个单词的第一个字母要大写，便于识别。
### FunCode API的命名规则，以dOnSpriteColSprite为例说明：
- d： 前缀，表明是FunCode提供的函数。目的是避免与用户自定义的函数名称重复。
- On：Windows编程中，习惯用On表示“当某某事件发生”
- Sprite：精灵
- Col：collision的缩写，碰撞。  

因此，该名称的含义的就是：当精灵与精灵发生碰撞事件发生。所有的FunCode API通过这种读法，都能从字面上了解函数的功能。通过单词首字母大写，虽然该名称由多个单词组成，也能一眼识别。
# 变量命名规则：
变量的命名一般采用“匈牙利命名法”。  
基本原则是：变量名 = 属性 + 类型 + 对象描述。
- 常用的属性：
    - g_：   全局变量（global）
    - c_：   常量（const）
    - s_：   静态变量（static）
- 常用的类型：
    - 浮点型（float）		f
    - 字符串（String） 		sz	其中z表示zero，因为在c中任何字符串的结束标记为’\0’
    - 双精度浮点（double）	  d
    - 字符（char）　		ch
    - 整型（Integer）　		i	
- 一些描述：
    - 最大　		Max 
    - 最小　		Min 
    - 初始化　	   Init 
    - 临时变量　	T（或Temp） 
    - 源对象　	Src 
    - 目的对象　	Dest

### 举例说明：
- szName -  这个变量是用来保存精灵名称的，名称一般都用字符串来表示。sz就指明了这个变量指向一个字符串，Name则说明他是一个名字。
- iColSide - i表示integer,即整型，ColSide是描述部分，Collsion Side的缩写，表示碰撞的边界，组合在一起表示： 该变量的类型为整型，它用来表示精灵与世界边界碰撞的方位。