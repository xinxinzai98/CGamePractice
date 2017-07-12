// TankEnemy.h: interface for the CTankEnemy class.
//
//////////////////////////////////////////////////////////////////////

#if !defined(AFX_TANKENEMY_H__D9651F48_7845_4EEA_A7F2_9AB71F1F4BE5__INCLUDED_)
#define AFX_TANKENEMY_H__D9651F48_7845_4EEA_A7F2_9AB71F1F4BE5__INCLUDED_

#include "Weapon.h" 

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000

#include "Weapon.h"

class CTankEnemy : public CWeapon  
{
private:
	float m_fMaxSpeed;//坦克最大速度
	float m_fTankBackLine;//制退距离

	int m_iEnemySpecies;//敌人种类
	int m_iEnemyBornTime;//敌人方出生时间
	int m_iPox;//出生X坐标
	int m_iPoy;//出生Y坐标
	bool m_bEnemyBorn;
	float m_fChangeDirTime;
	float m_fCHangeColorTime;
	float m_fFireTime;
	float m_fMinBox;
	bool m_bTanksLife;
public:
	//main
	CTankEnemy(const char*szname);
	virtual ~CTankEnemy();
	void OnMove(); //移动方法
	void OnMove(int dir);
	void OnFire(); //开火方法
	void Born();//出生
	void Loop(float fDeltaTime);//运行方法
	void OnColMap(int tanktrans);//与地图相撞
	void OnColTank();//与坦克相撞
	void OnColBullet(int owner,float attack);//与子弹相撞
	void TankBack();
	void OnColMiss(float attack);
	void IsDead();
	//Get
	float GetMaxSpeed() {return m_fMaxSpeed;}
	float GetTankBackLine() {return m_fTankBackLine;}
	int GetEnemySpecies() {return m_iEnemySpecies;}
	float GetEnemyBornTime() {return m_iEnemyBornTime;}
	bool GetEnemyBorn() {return m_bEnemyBorn;}//敌方坦克出生时间
	int GetNewPosX() {return m_iPox;}
	int GetNewPosY() {return m_iPoy;}
	bool GetTanksLife() {return m_bTanksLife;}
	//Set
	void SetTankBackLine(float tankbackline) {m_fTankBackLine = tankbackline;}
	void SetMaxSpeed(float maxspeed) {m_fMaxSpeed = maxspeed;}
	void SetEnemySpecies(int enemyspecies ) { m_iEnemySpecies = enemyspecies;}
	void SetEnemtBornTime(float enemyborntime) {m_iEnemyBornTime = enemyborntime;}
	void SetEnemtBorn(bool enemyborn) {m_bEnemyBorn = enemyborn;}
	void SetNewPosX(int pox) {m_iPox = pox;}
	void SetNewPosY(int poy) {m_iPoy = poy;}

};
#endif // !defined(AFX_TANKENEMY_H__D9651F48_7845_4EEA_A7F2_9AB71F1F4BE5__INCLUDED_)
